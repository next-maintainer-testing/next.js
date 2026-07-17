import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const cwd = new URL('.', import.meta.url).pathname
const port = 32000 + (process.pid % 1000)
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  NODE_ENV: 'production',
}

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const collect = (chunk) => {
      output += chunk.toString()
      if (output.length > 20000) output = output.slice(-20000)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Timed out: ${command} ${args.join(' ')}\n${output}`))
    }, timeoutMs)

    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`Command exited with code ${code} signal ${signal}: ${command} ${args.join(' ')}\n${output}`))
    })
  })
}

async function waitForServer(server, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js server exited early with code ${server.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

let browser = null
let server = null
let serverExit = null
let resultCode = 2

try {
  await rm(new URL('./.next', import.meta.url), { recursive: true, force: true })
  await run(process.execPath, [nextBin, 'build'], 180000)

  server = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverOutput = ''
  const collectServerOutput = (chunk) => {
    serverOutput += chunk.toString()
    if (serverOutput.length > 20000) serverOutput = serverOutput.slice(-20000)
  }
  server.stdout.on('data', collectServerOutput)
  server.stderr.on('data', collectServerOutput)
  serverExit = new Promise((resolve) => server.once('exit', resolve))

  const url = `http://127.0.0.1:${port}`
  await waitForServer(server, url, 30000)

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    args: chromium.args,
  })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.waitForFunction(
    () =>
      document.querySelector('#hydration-state')?.textContent === 'hydrated' &&
      performance.getEntriesByName('repro-client-hydrated', 'mark').length > 0,
    { timeout: 30000 }
  )

  const observation = await page.evaluate(() => ({
    hydrationText: document.querySelector('#hydration-state')?.textContent ?? null,
    probeMarks: performance
      .getEntriesByName('repro-client-hydrated', 'mark')
      .map((entry) => ({ name: entry.name, startTime: entry.startTime })),
    nextMeasures: performance
      .getEntriesByType('measure')
      .filter((entry) => entry.name.startsWith('Next.js-'))
      .map((entry) => ({
        name: entry.name,
        startTime: entry.startTime,
        duration: entry.duration,
      })),
  }))

  const expectedMeasure = 'Next.js-before-hydration'
  const hasExpectedMeasure = observation.nextMeasures.some(
    (entry) => entry.name === expectedMeasure
  )
  console.log(
    JSON.stringify(
      {
        expectedMeasure,
        symptom: hasExpectedMeasure
          ? 'absent: App Router hydration user timing measure exists'
          : 'present: hydrated App Router page has no Next.js-before-hydration measure',
        ...observation,
      },
      null,
      2
    )
  )
  resultCode = hasExpectedMeasure ? 1 : 0
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (browser) await browser.close().catch(() => {})
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      serverExit,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
    if (server.exitCode === null) {
      server.kill('SIGKILL')
      await serverExit
    }
  }
}

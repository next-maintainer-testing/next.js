import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const cwd = path.dirname(fileURLToPath(import.meta.url))
let server = null
let browser = null
let finalCode = 2

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const append = (chunk) => {
      output += chunk.toString()
      if (output.length > 20000) output = output.slice(-20000)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`${command} ${args.join(' ')} failed (${code ?? signal})\n${output}`))
    })
  })
}

async function browserExecutable() {
  const executable = puppeteer.executablePath()
  try {
    await run(executable, ['--headless', '--no-sandbox', '--version'], 10000)
    return executable
  } catch {
    const versionDirectory = path.dirname(path.dirname(executable))
    const buildId = path.basename(versionDirectory).replace(/^linux-/, '')
    const cacheDirectory = path.dirname(versionDirectory)
    const archive = path.join(cacheDirectory, `${buildId}-chrome-linux64.zip`)
    if (!existsSync(archive)) {
      await run(process.execPath, ['./node_modules/puppeteer/install.mjs'], 120000)
    }
    if (!existsSync(archive)) throw new Error(`Puppeteer browser archive is unavailable: ${archive}`)
    await rm(versionDirectory, { recursive: true, force: true })
    await run('unzip', ['-q', archive, '-d', versionDirectory], 120000)
    await run(executable, ['--headless', '--no-sandbox', '--version'], 10000)
    return executable
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`next start exited early with code ${server.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.status > 0) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('Timed out waiting for next start')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  const closed = new Promise((resolve) => server.once('close', resolve))
  server.kill('SIGTERM')
  const outcome = await Promise.race([
    closed.then(() => 'closed'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000)),
  ])
  if (outcome === 'timeout' && server.exitCode === null) {
    server.kill('SIGKILL')
    await closed
  }
}

try {
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], 180000)
  const port = await freePort()
  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverOutput = ''
  server.stdout.on('data', (chunk) => { serverOutput += chunk.toString() })
  server.stderr.on('data', (chunk) => { serverOutput += chunk.toString() })
  await waitForServer(`http://127.0.0.1:${port}/`, 30000)

  const executablePath = await browserExecutable()
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${port}/does-not-exist`, { waitUntil: 'networkidle0', timeout: 30000 })
  const initial = await page.evaluate(() => ({
    path: location.pathname,
    notFound: Boolean(document.querySelector('[data-page="not-found"]')),
    home: Boolean(document.querySelector('[data-page="home"]')),
  }))
  if (initial.path !== '/does-not-exist' || !initial.notFound || initial.home) {
    throw new Error(`Initial not-found page was invalid: ${JSON.stringify(initial)}`)
  }

  await page.click('[data-home-link]')
  await page.waitForFunction(() => location.pathname === '/', { timeout: 30000 })
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const after = await page.evaluate(() => ({
    path: location.pathname,
    notFound: Boolean(document.querySelector('[data-page="not-found"]')),
    home: Boolean(document.querySelector('[data-page="home"]')),
  }))

  if (after.path === '/' && after.notFound && !after.home) {
    console.log(`SYMPTOM_PRESENT ${JSON.stringify({ initial, after })}`)
    finalCode = 0
  } else if (after.path === '/' && !after.notFound && after.home) {
    console.log(`SYMPTOM_ABSENT ${JSON.stringify({ initial, after })}`)
    finalCode = 1
  } else {
    throw new Error(`Navigation ended in an indeterminate state: ${JSON.stringify(after)}\n${serverOutput}`)
  }
} catch (error) {
  console.error(error?.stack || error)
  finalCode = 2
} finally {
  process.exitCode = finalCode
  if (browser) await browser.close()
  await stopServer()
}

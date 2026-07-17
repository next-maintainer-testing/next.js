import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let child
let childExit
let logs = ''

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }, 10000)
  await childExit
  clearTimeout(timer)
}

async function getHtml(port) {
  const deadline = Date.now() + 120000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js exited before serving the page (${child.exitCode ?? child.signalCode})`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      if (response.ok) return await response.text()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError?.message ?? 'unknown error'}`)
}

try {
  const nextBin = require.resolve('next/dist/bin/next')
  const port = await freePort()
  child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  childExit = new Promise((resolve) => child.once('exit', resolve))
  child.stdout.on('data', (chunk) => { logs = (logs + chunk).slice(-12000) })
  child.stderr.on('data', (chunk) => { logs = (logs + chunk).slice(-12000) })

  const html = await getHtml(port)
  const relevantTags = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /content=["']FB_APP_ID["']/i.test(tag))
  const hasIncorrectName = relevantTags.some((tag) => /\bname=["']fb:app_id["']/i.test(tag))
  const hasExpectedProperty = relevantTags.some((tag) => /\bproperty=["']fb:app_id["']/i.test(tag))

  console.log(JSON.stringify({ relevantTags, hasIncorrectName, hasExpectedProperty }))
  if (hasIncorrectName && !hasExpectedProperty) {
    process.exitCode = 0
  } else if (hasExpectedProperty && !hasIncorrectName) {
    process.exitCode = 1
  } else {
    console.error(`Could not classify metadata output. Next.js logs:\n${logs}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(error?.stack ?? error)
  if (logs) console.error(`Next.js logs:\n${logs}`)
  process.exitCode = 2
} finally {
  await stopChild()
}

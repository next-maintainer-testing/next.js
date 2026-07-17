import { spawn } from 'node:child_process'
import net from 'node:net'

const host = '127.0.0.1'
const startupTimeoutMs = 120_000
let child
let outcome = 2

function getPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function fetchReady(url) {
  const deadline = Date.now() + startupTimeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError?.message ?? 'unknown error'}`)
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  const port = await getPort()
  const origin = `http://${host}:${port}`
  child = spawn(process.execPath, [
    'node_modules/next/dist/bin/next',
    'dev',
    '--turbopack',
    '--hostname', host,
    '--port', String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let logs = ''
  child.stdout.on('data', (chunk) => { logs += chunk })
  child.stderr.on('data', (chunk) => { logs += chunk })

  const response = await fetchReady(origin)
  const html = await response.text()
  const hrefs = [...html.matchAll(/href=["']([^"']+\.css(?:\?[^"']*)?)["']/g)].map((match) => match[1])
  if (hrefs.length === 0) throw new Error('Rendered page did not reference a CSS asset')

  const cssAssets = await Promise.all(hrefs.map(async (href) => {
    const cssResponse = await fetch(new URL(href, origin))
    if (!cssResponse.ok) throw new Error(`CSS request failed with HTTP ${cssResponse.status}`)
    return cssResponse.text()
  }))
  const css = cssAssets.join('\n')
  const hasRule = /padding-(?:inline-start|left)\s*:\s*20px/i.test(css)
  if (!hasRule) throw new Error('Compiled CSS did not contain the test declaration')

  const higherSpecificitySelector = /ul:not\(\s*:-webkit-any\(/i.test(css)
  outcome = higherSpecificitySelector ? 0 : 1
  console.log(higherSpecificitySelector
    ? 'SYMPTOM PRESENT: emitted CSS contains a higher-specificity ul:not(:-webkit-any(...)) selector'
    : 'SYMPTOM ABSENT: emitted CSS does not contain the higher-specificity selector')
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack ?? error}`)
  outcome = 2
} finally {
  process.exitCode = outcome
  await stopChild()
}

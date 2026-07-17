import { spawn } from 'node:child_process'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

async function getOpenPort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return port
}

async function waitForPage(url, child, output) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})\n${output.text}`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      if (response.status < 500) {
        await response.text()
        return
      }
    } catch {}
    await delay(500)
  }
  throw new Error(`Timed out waiting for Next.js\n${output.text}`)
}

async function stopServer(child, exited) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const stopped = await Promise.race([exited.then(() => true), delay(10_000).then(() => false)])
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}

const port = await getOpenPort()
const output = { text: '' }
const child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const exited = new Promise((resolve) => child.once('exit', resolve))
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output.text = (output.text + chunk.toString()).slice(-12_000)
  })
}

try {
  const baseUrl = `http://127.0.0.1:${port}`
  await waitForPage(`${baseUrl}/?ready=1`, child, output)

  const normal = await fetch(`${baseUrl}/?request=normal`, {
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(30_000),
  })
  await normal.text()
  const preload = await fetch(`${baseUrl}/?request=chrome-preload`, {
    headers: { 'cache-control': 'no-cache', purpose: 'prefetch' },
    signal: AbortSignal.timeout(30_000),
  })
  await preload.text()

  const normalCsp = normal.headers.get('content-security-policy')
  const preloadCsp = preload.headers.get('content-security-policy')
  const normalRan = normal.headers.get('x-repro-middleware')
  const preloadRan = preload.headers.get('x-repro-middleware')

  console.log(JSON.stringify({
    normal: { status: normal.status, csp: Boolean(normalCsp), middleware: normalRan },
    chromePreload: { status: preload.status, csp: Boolean(preloadCsp), middleware: preloadRan },
  }))

  if (normal.status !== 200 || normalRan !== 'ran' || !normalCsp) {
    console.error('Control request did not run the CSP middleware as required.')
    process.exitCode = 2
  } else if (preload.status !== 200) {
    console.error(`Chrome preload request returned unexpected status ${preload.status}.`)
    process.exitCode = 2
  } else if (!preloadCsp && preloadRan === null) {
    console.error('Symptom reproduced: Purpose: prefetch skipped middleware and omitted CSP.')
    process.exitCode = 0
  } else if (preloadCsp && preloadRan === 'ran') {
    console.error('Symptom absent: CSP middleware ran for Purpose: prefetch.')
    process.exitCode = 1
  } else {
    console.error('Chrome preload response was inconsistent with either expected outcome.')
    process.exitCode = 2
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 2
} finally {
  await stopServer(child, exited)
}

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const output = []
let child

function record(chunk) {
  output.push(String(chunk))
  while (output.join('').length > 12000) output.shift()
}

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function fetchUntilReady(url, deadline) {
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      await response.arrayBuffer()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`Next.js did not become ready: ${lastError?.message || 'timeout'}`)
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  const port = await getOpenPort()
  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', record)
  child.stderr.on('data', record)

  const origin = `http://127.0.0.1:${port}`
  await fetchUntilReady(`${origin}/`, Date.now() + 90000)

  const assetPath = '/_next/static/chunks/issue-73028-definitely-missing.js'
  const response = await fetch(`${origin}${assetPath}`, { signal: AbortSignal.timeout(30000) })
  const body = await response.text()
  const contentType = response.headers.get('content-type') || ''
  const renderedCatchAll = body.includes('<div>Page</div>')
  const intercepted = response.status === 200 && contentType.includes('text/html') && renderedCatchAll

  console.log(JSON.stringify({ assetPath, status: response.status, contentType, catchAllPageRendered: renderedCatchAll, symptomPresent: intercepted }))
  process.exitCode = intercepted ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  console.error(output.join('').slice(-12000))
  process.exitCode = 2
} finally {
  await stopChild()
}

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function getAvailablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = address.port
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(`${origin}/api/delay`, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error('next dev did not become ready within 60 seconds')
}

function markerIsInsideHiddenDiv(html) {
  const markerIndex = html.indexOf('id="repro-content-marker"')
  if (markerIndex === -1) throw new Error('rendered page did not contain the content marker')

  const hiddenIndex = html.lastIndexOf('<div hidden id="S:', markerIndex)
  if (hiddenIndex === -1) return false

  let depth = 0
  const divTags = html.slice(hiddenIndex, markerIndex).matchAll(/<\/?div\b[^>]*>/g)
  for (const match of divTags) {
    if (match[0].startsWith('</')) depth -= 1
    else depth += 1
    if (depth === 0) return false
  }
  return depth > 0
}

const port = await getAvailablePort()
const origin = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    REPRO_ORIGIN: origin,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })

let exitCode = 2
try {
  await waitForServer(origin, child)
  const response = await fetch(origin, {
    headers: {
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`page request returned HTTP ${response.status}`)
  const html = await response.text()
  const reproduced = markerIsInsideHiddenDiv(html)
  console.log(reproduced
    ? 'REPRODUCED: fetched page content is inside a hidden streaming div in the raw HTML response'
    : 'NOT_REPRODUCED: fetched page content is not inside a hidden streaming div in the raw HTML response')
  exitCode = reproduced ? 0 : 1
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  console.error(output)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(5_000).then(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      }),
    ])
  }
}

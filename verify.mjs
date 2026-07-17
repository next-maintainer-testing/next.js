import { spawn } from 'node:child_process'

const host = '127.0.0.1'
const port = 34567
const endpoint = `http://${host}:${port}/pathname/sitemap/0.xml`
const expectedLocation = '<loc>https://example.com/pathname/1</loc>'
const expectedAlternate =
  '<xhtml:link rel="alternate" media="only screen and (max-width: 640px)" href="https://m.example.com/pathname/1" />'

let server
let logs = ''
let result = 2

function appendLog(chunk) {
  logs = (logs + chunk.toString()).slice(-12000)
}

async function waitForSitemap() {
  const deadline = Date.now() + 120_000
  let lastError = 'server did not respond'

  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint)
      const body = await response.text()
      if (response.status === 200 && body.includes(expectedLocation)) {
        return { response, body }
      }
      lastError = `HTTP ${response.status}: ${body.slice(0, 500)}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for sitemap: ${lastError}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return

  const closed = new Promise((resolve) => server.once('close', resolve))
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    server.kill('SIGTERM')
  }

  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 8_000)),
  ])

  if (!stopped && server.exitCode === null) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      server.kill('SIGKILL')
    }
    await Promise.race([
      closed,
      new Promise((resolve) => setTimeout(resolve, 8_000)),
    ])
  }
}

try {
  server = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '--hostname', host, '--port', String(port)],
    {
      cwd: process.cwd(),
      detached: process.platform !== 'win32',
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  server.stdout.on('data', appendLog)
  server.stderr.on('data', appendLog)

  const { response, body } = await waitForSitemap()
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/xml')) {
    throw new Error(`Unexpected content type ${JSON.stringify(contentType)}`)
  }

  if (body.includes(expectedAlternate)) {
    console.log('Symptom absent: generated sitemap includes the media alternate.')
    result = 1
  } else {
    console.log('Symptom reproduced: generated sitemap omits the media alternate.')
    console.log(body)
    result = 0
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  if (logs) console.error(`Server output:\n${logs}`)
  result = 2
} finally {
  process.exitCode = result
  await stopServer()
}

import { spawn } from 'node:child_process'

const host = '127.0.0.1'
const port = 32000 + (process.pid % 20000)
const url = `http://${host}:${port}/my-path/test?param=123`
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
let server
let logs = ''

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function appendLog(chunk) {
  logs = (logs + chunk.toString()).slice(-12000)
}

async function fetchRenderedValue() {
  const deadline = Date.now() + 90000
  let lastError

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited early with code ${server.exitCode}\n${logs}`)
    }

    try {
      const response = await fetch(url)
      if (response.ok) {
        const html = await response.text()
        const meta = html.match(/<meta[^>]*name=["']router-query-param["'][^>]*>/i)?.[0]
        const encodedValue = meta?.match(/content=["']([^"']*)["']/i)?.[1]
        if (encodedValue !== undefined) {
          return encodedValue
            .replaceAll('&quot;', '"')
            .replaceAll('&#x27;', "'")
            .replaceAll('&amp;', '&')
            .replaceAll('&lt;', '<')
            .replaceAll('&gt;', '>')
        }
      }
    } catch (error) {
      lastError = error
    }

    await delay(500)
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError ?? 'no rendered marker'}\n${logs}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return

  const exited = new Promise((resolve) => server.once('exit', resolve))
  try {
    if (process.platform === 'win32') server.kill('SIGTERM')
    else process.kill(-server.pid, 'SIGTERM')
  } catch {}

  const stopped = await Promise.race([exited.then(() => true), delay(5000).then(() => false)])
  if (!stopped && server.exitCode === null) {
    try {
      if (process.platform === 'win32') server.kill('SIGKILL')
      else process.kill(-server.pid, 'SIGKILL')
    } catch {}
    await exited
  }
}

try {
  server = spawn(npmCommand, ['run', 'dev', '--', '--hostname', host, '--port', String(port)], {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', appendLog)
  server.stderr.on('data', appendLog)

  const observed = await fetchRenderedValue()
  console.log(JSON.stringify({ url, observed, expectedQueryValue: '123', dynamicSegment: 'test' }))

  if (observed === 'test') process.exitCode = 0
  else if (observed === '123') process.exitCode = 1
  else {
    console.error(`Unexpected useRouter().query.param value: ${JSON.stringify(observed)}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  await stopServer()
}

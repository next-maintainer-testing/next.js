import { spawn } from 'node:child_process'
import http from 'node:http'

const port = 32177
const symptom = 'Expected a suspended thenable'
let output = ''

function append(chunk) {
  output += chunk.toString()
  if (output.length > 200_000) output = output.slice(-200_000)
}

function requestPage() {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { hostname: '127.0.0.1', port, path: '/', timeout: 10_000 },
      (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body += chunk
          if (body.length > 200_000) body = body.slice(-200_000)
        })
        response.on('end', () => resolve({ status: response.statusCode, body }))
      }
    )
    request.on('timeout', () => request.destroy(new Error('request timed out')))
    request.on('error', reject)
  })
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function stopServer(server) {
  if (server.exitCode !== null || server.signalCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('close', resolve)),
    delay(5_000).then(() => {
      if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL')
    }),
  ])
  if (server.exitCode === null && server.signalCode === null) {
    await new Promise((resolve) => server.once('close', resolve))
  }
}

const server = spawn(
  process.execPath,
  ['./node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
  { cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }
)
server.stdout.on('data', append)
server.stderr.on('data', append)

let observation
let resultCode = 2
const deadline = Date.now() + 90_000

try {
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Next.js exited before serving the page (${server.exitCode ?? server.signalCode})`)
    }
    try {
      observation = await requestPage()
      break
    } catch {
      await delay(500)
    }
  }

  if (!observation) throw new Error('Next.js did not serve the page before the deadline')
  await delay(1_000)

  const evidence = `${observation.body}\n${output}`
  if (evidence.includes(symptom)) {
    resultCode = 0
    console.log(`SYMPTOM_PRESENT: ${symptom} (HTTP ${observation.status})`)
  } else if (observation.status === 200 && observation.body.includes('POSTS_RENDERED')) {
    resultCode = 1
    console.log('SYMPTOM_ABSENT: page rendered POSTS_RENDERED successfully')
  } else {
    throw new Error(`Unexpected response (HTTP ${observation.status}); reported error and success marker were both absent`)
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.message}`)
  console.error(output.slice(-10_000))
  resultCode = 2
}

process.exitCode = resultCode
await stopServer(server)

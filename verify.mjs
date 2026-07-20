import { spawn } from 'node:child_process'
import http from 'node:http'

const port = 32000 + (process.pid % 1000)
const expectedBody = JSON.stringify({ entry: 'contentful-webhook' })
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
)

let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk.toString() })
child.stderr.on('data', (chunk) => { logs += chunk.toString() })

function postWebhook() {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/revalidate',
      method: 'POST',
      headers: {
        'content-type': 'application/vnd.contentful.management.v1+json',
        'content-length': Buffer.byteLength(expectedBody),
      },
    }, (response) => {
      let responseBody = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { responseBody += chunk })
      response.on('end', () => resolve({ status: response.statusCode, responseBody }))
    })
    request.on('error', reject)
    request.end(expectedBody)
  })
}

async function waitForResult() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the request (code ${child.exitCode})`)
    }
    try {
      const response = await postWebhook()
      if (response.status === 200) return response
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for the Next.js API route')
}

async function stopChild() {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  const { responseBody } = await waitForResult()
  const parsed = JSON.parse(responseBody)
  if (parsed.bodyType === 'string' && parsed.body === expectedBody) {
    console.log('SYMPTOM PRESENT: vendor +json request body remained an unparsed string')
    process.exitCode = 0
  } else if (parsed.bodyType === 'object' && parsed.body?.entry === 'contentful-webhook') {
    console.log('SYMPTOM ABSENT: vendor +json request body was parsed as JSON')
    process.exitCode = 1
  } else {
    console.error(`CHECK FAILED: unexpected API response ${responseBody}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.message}`)
  console.error(logs.slice(-4000))
  process.exitCode = 2
} finally {
  await stopChild()
}

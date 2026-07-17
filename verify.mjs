import { spawn } from 'node:child_process'
import http from 'node:http'

const port = 32113
const expectedError = 'Cannot add property rel, object is not extensible'
const pageMarker = 'Issue 78013 reproduction'
let output = ''
let child
let result = 2

function requestPage() {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { hostname: '127.0.0.1', port, path: '/', timeout: 120_000 },
      (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          body += chunk
        })
        response.on('end', () => resolve({ status: response.statusCode, body }))
      }
    )
    request.on('timeout', () => request.destroy(new Error('HTTP request timed out')))
    request.on('error', reject)
  })
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await Promise.race([exited, delay(5_000)])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}

try {
  child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  let response
  let lastError
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${child.exitCode})`)
    }
    try {
      response = await requestPage()
      break
    } catch (error) {
      lastError = error
      await delay(250)
    }
  }
  if (!response) throw lastError ?? new Error('Next.js did not become ready')

  await delay(500)
  const evidence = `${response.body}\n${output}`
  if (evidence.includes(expectedError)) {
    console.log(`REPRODUCED: ${expectedError}`)
    result = 0
  } else if (response.status === 200 && response.body.includes(pageMarker)) {
    console.log('NOT REPRODUCED: page rendered without the metadata mutation error')
    result = 1
  } else {
    console.error(`CHECK FAILED: unexpected HTTP ${response.status}`)
    console.error(output.slice(-4000))
    result = 2
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack ?? error}`)
  console.error(output.slice(-4000))
  result = 2
} finally {
  process.exitCode = result
  await stopServer()
}

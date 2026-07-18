import { spawn } from 'node:child_process'
import http from 'node:http'

const port = 41000 + (process.pid % 1000)
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
)

let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })

function requestPage() {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/`, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolve({ status: response.statusCode, body }))
    })
    request.on('error', reject)
    request.setTimeout(10_000, () => request.destroy(new Error('request timed out')))
  })
}

async function waitForPage() {
  const deadline = Date.now() + 90_000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early (${child.exitCode})\n${output}`)
    try {
      const response = await requestPage()
      if (response.status === 200) return response.body
      lastError = new Error(`HTTP ${response.status}: ${response.body.slice(0, 500)}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for rendered documentation check: ${lastError}\n${output}`)
}

async function stopChild() {
  if (child.exitCode !== null) return
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
  const body = await waitForPage()
  if (!body.includes('data-reported-hook=')) {
    throw new Error(`Rendered page did not expose the required result marker\n${body.slice(0, 1000)}`)
  }
  const symptomPresent = body.includes('data-reported-hook="useFormState"')
  console.log(symptomPresent
    ? 'Reproduced: rendered authentication docs refer to useFormState.'
    : 'Not reproduced: rendered authentication docs do not refer to useFormState.')
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  await stopChild()
}

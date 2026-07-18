import { spawn } from 'node:child_process'
import net from 'node:net'

const port = await new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    server.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '--hostname', '127.0.0.1', '--port', String(port)],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } }
)

let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })

let outcome = 2
try {
  const deadline = Date.now() + 120_000
  let response
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the route (code ${child.exitCode})\n${output}`)
    }
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/render`)
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  if (!response) throw new Error(`Timed out waiting for Next.js\n${output}`)

  const body = await response.text()
  const symptom = response.status === 500 && /isSpace is not defined/.test(body)
  const absent = response.ok && /tokenTypes/.test(body)

  if (symptom) {
    console.log(`Reproduced runtime ReferenceError from API route: HTTP ${response.status} ${body}`)
    outcome = 0
  } else if (absent) {
    console.log(`Markdown parsed successfully: HTTP ${response.status} ${body}`)
    outcome = 1
  } else {
    throw new Error(`Unexpected route response: HTTP ${response.status} ${body}\n${output}`)
  }
} catch (error) {
  console.error(error)
  outcome = 2
} finally {
  process.exitCode = outcome
  if (child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 10_000))
    ])
    if (child.exitCode === null) {
      child.kill('SIGKILL')
      await new Promise((resolve) => child.once('exit', resolve))
    }
  }
}

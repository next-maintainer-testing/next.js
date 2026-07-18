import { spawn } from 'node:child_process'
import net from 'node:net'

const output = []
let child
let result = 2

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

function waitForReady(timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Next.js dev server did not become ready')), timeoutMs)
    const check = (chunk) => {
      const text = chunk.toString()
      output.push(text)
      if (/Ready in|Starting\.\.\./.test(output.join(''))) {
        clearTimeout(timer)
        resolve()
      }
    }
    child.stdout.on('data', check)
    child.stderr.on('data', check)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Next.js dev server exited early with code ${code}`))
    })
  })
}

function stopChild() {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve()
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

try {
  const port = await reservePort()
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await waitForReady(60000)
  const response = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { 'x-nonce': 'issue-77343' },
  })
  await response.text()
  await new Promise((resolve) => setTimeout(resolve, 1000))

  const log = output.join('').replace(/\x1b\[[0-9;]*m/g, '')
  const reportedDiagnostic =
    (/headers\(\)\.get/.test(log) && /should be awaited/.test(log)) ||
    /TypeError:\s*headers\(\.\.\.\)\.get is not a function/.test(log) ||
    /TypeError:\s*headers\(\)\.get is not a function/.test(log)

  result = reportedDiagnostic ? 0 : 1
  console.log(JSON.stringify({
    symptom: reportedDiagnostic ? 'synchronous headers().get runtime error observed' : 'reported runtime error absent',
    status: response.status,
  }))
} catch (error) {
  console.error(error.stack || error)
  result = 2
} finally {
  process.exitCode = result
  await stopChild()
}

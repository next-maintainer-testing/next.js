import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'

const require = createRequire(import.meta.url)
const marker = 'ORIGINAL_INSTRUMENTATION_ERROR_78457'
const maskingError = /Cannot set propert(?:y|ies) message of .*which has only a getter/i

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

const port = await reservePort()
const child = spawn(process.execPath, [
  require.resolve('next/dist/bin/next'),
  'dev',
  '--hostname',
  '127.0.0.1',
  '--port',
  String(port),
], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', CI: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
let settled = false
let finish
const outcome = new Promise((resolve) => { finish = resolve })

function inspect(chunk) {
  output += chunk.toString()
  process.stdout.write(chunk)
  if (maskingError.test(output)) {
    settled = true
    finish(0)
  } else if (output.includes(marker)) {
    settled = true
    finish(1)
  }
}

child.stdout.on('data', inspect)
child.stderr.on('data', inspect)
child.once('error', (error) => {
  console.error(error)
  if (!settled) {
    settled = true
    finish(2)
  }
})
child.once('exit', (code, signal) => {
  if (!settled) {
    console.error(`next dev exited before an observable result (code=${code}, signal=${signal})`)
    settled = true
    finish(2)
  }
})

const timer = setTimeout(() => {
  if (!settled) {
    console.error('Timed out waiting for the instrumentation loading error')
    settled = true
    finish(2)
  }
}, 90000)

const result = await outcome
process.exitCode = result
clearTimeout(timer)

if (child.exitCode === null && child.signalCode === null) {
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

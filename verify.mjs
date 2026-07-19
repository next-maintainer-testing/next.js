import { spawn } from 'node:child_process'
import net from 'node:net'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function reservePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

const port = await reservePort()
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
const append = (chunk) => {
  output += chunk.toString()
  if (output.length > 100_000) output = output.slice(-100_000)
}
child.stdout.on('data', append)
child.stderr.on('data', append)

let exited = false
let exitCode = null
const exitPromise = new Promise((resolve) => {
  child.once('exit', (code) => {
    exited = true
    exitCode = code
    resolve()
  })
})

const deadline = Date.now() + 120_000
let httpStatus = null
while (!exited && Date.now() < deadline) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`)
    httpStatus = response.status
    await response.text()
    break
  } catch {
    await sleep(250)
  }
}

const configError = /Unrecognized key\(s\) in object: ['"]search['"] at ['"]images\.remotePatterns\[0\]['"]/.test(output)

if (configError) {
  console.log('SYMPTOM PRESENT: Next.js rejected the documented images.remotePatterns search field.')
  process.exitCode = 0
} else if (httpStatus !== null && httpStatus < 500) {
  console.log(`SYMPTOM ABSENT: Next.js accepted the config and served the page (HTTP ${httpStatus}).`)
  process.exitCode = 1
} else {
  console.error(`CHECK FAILED: server exit=${exitCode}, http=${httpStatus}\n${output}`)
  process.exitCode = 2
}

if (!exited) {
  child.kill('SIGTERM')
  await Promise.race([exitPromise, sleep(10_000)])
  if (!exited) {
    child.kill('SIGKILL')
    await exitPromise
  }
} else {
  await exitPromise
}

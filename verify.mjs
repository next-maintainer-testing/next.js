import { spawn } from 'node:child_process'
import process from 'node:process'

const port = 32000 + Math.floor(Math.random() * 2000)
const cwd = new URL('.', import.meta.url).pathname
let output = ''
let child

const append = (chunk) => {
  output += chunk.toString()
  if (output.length > 1_000_000) output = output.slice(-1_000_000)
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const graceful = await Promise.race([exited.then(() => true), delay(5000).then(() => false)])
  if (!graceful && child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
  child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  let responseReceived = false
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline && !responseReceived) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before serving a request (code ${child.exitCode})`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/?issue=56262`, {
        signal: AbortSignal.timeout(30_000),
      })
      await response.text()
      responseReceived = true
    } catch {
      await delay(500)
    }
  }
  if (!responseReceived) throw new Error('Timed out waiting for the Next.js response')

  await delay(1000)
  const markerObserved = output.includes('ISSUE_56262_CLIENT_COMPONENT_SERVER_RENDER')
  const windowErrorObserved = /ReferenceError:\s*window is not defined/.test(output)
  const reproduced = markerObserved && windowErrorObserved

  console.log(`markerObserved=${markerObserved}`)
  console.log(`windowReferenceErrorObserved=${windowErrorObserved}`)
  console.log(`symptomPresent=${reproduced}`)
  if (!reproduced) console.log(output.slice(-5000))
  process.exitCode = reproduced ? 0 : 1
  await stopServer()
} catch (error) {
  console.error(`Verification failed: ${error.stack || error}`)
  console.error(output.slice(-5000))
  process.exitCode = 2
  await stopServer()
}

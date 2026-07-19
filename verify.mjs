import { spawn } from 'node:child_process'
import net from 'node:net'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  await Promise.race([exited, delay(5000)])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

const port = await availablePort()
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk.toString(); process.stdout.write(chunk) })
child.stderr.on('data', (chunk) => { logs += chunk.toString(); process.stderr.write(chunk) })

try {
  const deadline = Date.now() + 120000
  let response
  let body = ''
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js exited before verification (code=${child.exitCode}, signal=${child.signalCode})`)
    }
    try {
      response = await fetch(`http://127.0.0.1:${port}/en/definitely-missing`)
      body = await response.text()
      break
    } catch {
      await delay(250)
    }
  }
  if (!response) throw new Error('Timed out waiting for Next.js')

  const customRendered = body.includes('CUSTOM LOCALE NOT FOUND') || body.includes('locale-custom-not-found')
  const defaultRendered = body.includes('This page could not be found')
  console.log(`Observed status=${response.status} customLocale404=${customRendered} default404=${defaultRendered}`)

  if (response.status === 404 && !customRendered && defaultRendered) {
    console.log('SYMPTOM_PRESENT: unmatched locale URL rendered the default Next.js 404')
    process.exitCode = 0
  } else if (response.status === 404 && customRendered) {
    console.log('SYMPTOM_ABSENT: unmatched locale URL rendered app/[lang]/not-found.js')
    process.exitCode = 1
  } else {
    console.error(`CHECK_FAILED: unexpected response; status=${response.status}; body=${body.slice(0, 500)}; logs=${logs.slice(-1000)}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  process.exitCode = 2
} finally {
  await stop(child)
}

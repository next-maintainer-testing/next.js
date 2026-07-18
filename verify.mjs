import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import net from 'node:net'

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function waitForResponse(url, child) {
  const deadline = Date.now() + 120_000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited during startup with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.status < 500) return response
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError?.message ?? 'no response'}`)
}

async function stop(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise(resolve => child.once('exit', resolve))
  const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
  await exited
  clearTimeout(timer)
}

let child
try {
  const port = await availablePort()
  child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })

  const url = `http://127.0.0.1:${port}/transactions/7089?type=IBP`
  const response = await waitForResponse(url, child)
  const body = await response.text()
  const wrongRoute = '<main id="route-result">send-money-route:country=transactions:bank=7089</main>'
  const expectedRoute = '<main id="route-result">transactions-route:id=7089:type=IBP</main>'

  if (response.status === 200 && body.includes(wrongRoute)) {
    console.log('SYMPTOM PRESENT: /transactions/7089?type=IBP rendered the send-money route with country=transactions and bank=7089')
    process.exitCode = 0
  } else if (response.status === 200 && body.includes(expectedRoute)) {
    console.log('SYMPTOM ABSENT: the transactions route rendered id=7089 and type=IBP')
    process.exitCode = 1
  } else {
    console.error(`CHECK FAILED: status=${response.status}; expected rendered route marker was not found`)
    console.error(body.slice(0, 1000))
    console.error(output.slice(-2000))
    process.exitCode = 2
  }
} catch (error) {
  console.error('CHECK FAILED:', error)
  process.exitCode = 2
} finally {
  if (child) await stop(child)
}

import { spawn } from 'node:child_process'
import net from 'node:net'

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const closed = new Promise((resolve) => child.once('close', resolve))
  const timer = new Promise((resolve) => setTimeout(resolve, 5000, 'timeout'))
  if ((await Promise.race([closed, timer])) === 'timeout' && child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('close', resolve))
  }
}

const port = await freePort()
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk.toString() })
child.stderr.on('data', (chunk) => { logs += chunk.toString() })

let result = 2
let observation = ''
try {
  const origin = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 90000
  let ready = false
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited during startup with code ${child.exitCode}`)
    try {
      const response = await fetch(`${origin}/nextjs`)
      if (response.ok) {
        await response.text()
        ready = true
        break
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!ready) throw new Error('Next.js did not become ready within 90 seconds')

  const response = await fetch(`${origin}/nextjs/_next/data/development/index.json`, {
    headers: { 'x-nextjs-data': '1' },
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`data request returned HTTP ${response.status}: ${body.slice(0, 300)}`)

  let data
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error(`data request did not return JSON: ${body.slice(0, 300)}`)
  }

  const page = data?.pageProps?.page
  if (page === 'DYNAMIC_PAGE' && data?.pageProps?.whatever === 'index') {
    result = 0
    observation = 'symptom present: the index data request was incorrectly rendered by /[whatever] with parameter "index"'
  } else if (page === 'INDEX_PAGE') {
    result = 1
    observation = 'symptom absent: the index data request rendered the index page'
  } else {
    throw new Error(`unexpected data response: ${body.slice(0, 500)}`)
  }
} catch (error) {
  observation = `check failed: ${error.message}`
  result = 2
}

process.exitCode = result
await stop(child)
console.log(observation)
if (result === 2) console.error(logs.slice(-4000))

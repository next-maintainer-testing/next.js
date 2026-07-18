import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const socket = net.createServer()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const { port } = socket.address()
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()))
  return port
}

const port = await freePort()
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
server.stdout.on('data', (chunk) => { logs += chunk })
server.stderr.on('data', (chunk) => { logs += chunk })

try {
  const deadline = Date.now() + 120_000
  let ready = false
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next dev exited early (${server.exitCode})\n${logs}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/base/`)
      if (response.ok) {
        ready = true
        break
      }
    } catch {}
    await sleep(250)
  }
  if (!ready) throw new Error(`next dev did not become ready\n${logs}`)

  const url = `http://127.0.0.1:${port}/base/_next/data/development/index.json`
  const response = await fetch(url, { redirect: 'manual' })
  const location = response.headers.get('location')
  const symptomPresent = response.status === 308 && location === '/base'

  console.log(JSON.stringify({
    request: '/base/_next/data/development/index.json',
    status: response.status,
    location,
    symptom: symptomPresent
      ? 'home page data request was permanently redirected to /base'
      : 'home page data request was not permanently redirected to /base',
  }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  if (server.exitCode === null) server.kill('SIGTERM')
  await Promise.race([once(server, 'exit'), sleep(10_000)])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await once(server, 'exit')
  }
}

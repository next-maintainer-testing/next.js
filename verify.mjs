import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const cwd = new URL('.', import.meta.url).pathname
const children = []
let api
let missing = false
let missingRequests = 0

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

function run(command, args, env) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  return { child, output: () => output }
}

async function stop(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([once(child, 'exit'), delay(5000)])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}

try {
  const apiPort = await freePort()
  const nextPort = await freePort()
  api = http.createServer((request, response) => {
    if (request.url !== '/2') {
      response.writeHead(404).end('not found')
      return
    }
    if (missing) {
      missingRequests += 1
      response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}')
    } else {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"name":"Cached product"}')
    }
  })
  api.listen(apiPort, '127.0.0.1')
  await once(api, 'listening')

  const env = { ...process.env, API_ORIGIN: `http://127.0.0.1:${apiPort}`, NEXT_TELEMETRY_DISABLED: '1' }
  const build = run(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], env)
  const [buildCode] = await once(build.child, 'exit')
  if (buildCode !== 0) throw new Error(`next build failed (${buildCode})\n${build.output()}`)

  const started = run(process.execPath, ['./node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(nextPort)], env)
  const url = `http://127.0.0.1:${nextPort}/products/2`
  let ready = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (started.child.exitCode !== null) throw new Error(`next start exited early\n${started.output()}`)
    try {
      const response = await fetch(url)
      if (response.status === 200 && (await response.text()).includes('Cached product')) {
        ready = true
        break
      }
    } catch {}
    await delay(100)
  }
  if (!ready) throw new Error(`server did not serve the initial product\n${started.output()}`)

  await delay(1300)
  missing = true

  const observations = []
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url)
    observations.push({ status: response.status, staleProduct: (await response.text()).includes('Cached product') })
    await delay(1300)
  }

  if (missingRequests === 0) throw new Error(`the stale entry was never revalidated against the 404 API response: ${JSON.stringify(observations)}`)

  const symptomPresent = observations.every(({ status, staleProduct }) => status === 200 && staleProduct)
  process.stdout.write(`${JSON.stringify({ missingRequests, observations, symptomPresent })}\n`)
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  process.exitCode = 2
} finally {
  for (const child of children.reverse()) await stop(child)
  if (api) {
    api.close()
    await once(api, 'close')
  }
}

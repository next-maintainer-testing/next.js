import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createConnection, createServer as createNetServer } from 'node:net'

const root = new URL('.', import.meta.url).pathname
let requestCount = 0
let nextProcess
let resultCode = 2

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address().port)
    })
  })
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()))
}

async function freePort() {
  const server = createNetServer()
  const port = await listen(server)
  await closeServer(server)
  return port
}

function run(command, args, env, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} timed out\n${output.slice(-4000)}`))
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`${command} exited with ${code ?? signal}\n${output.slice(-4000)}`))
    })
  })
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const connected = await new Promise((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => resolve(false))
    })
    if (connected) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Next.js server did not start in time')
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

const graphQLServer = createServer((request, response) => {
  if (request.method !== 'POST') {
    response.writeHead(405).end()
    return
  }
  requestCount += 1
  let body = ''
  request.setEncoding('utf8')
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => {
    if (!body.includes('Value')) {
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ errors: [{ message: 'unexpected query' }] }))
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ data: { value: 'ok' } }))
  })
})

try {
  const graphQLPort = await listen(graphQLServer)
  const nextPort = await freePort()
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    GRAPHQL_URL: `http://127.0.0.1:${graphQLPort}/graphql`,
    NEXT_TELEMETRY_DISABLED: '1',
  }

  await run(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], env, 180000)

  let serverOutput = ''
  nextProcess = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'start', '-p', String(nextPort)], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  nextProcess.stdout.on('data', (chunk) => { serverOutput += chunk })
  nextProcess.stderr.on('data', (chunk) => { serverOutput += chunk })
  await waitForPort(nextPort, 60000)

  requestCount = 0
  const response = await fetch(`http://127.0.0.1:${nextPort}/`)
  const html = await response.text()
  if (!response.ok || !html.includes('Both identical GraphQL requests completed')) {
    throw new Error(`Page request failed with HTTP ${response.status}\n${serverOutput.slice(-4000)}`)
  }

  if (requestCount === 2) {
    console.log('SYMPTOM_PRESENT: one render issued 2 identical GraphQL POST requests')
    resultCode = 0
  } else if (requestCount === 1) {
    console.log('SYMPTOM_ABSENT: one render issued 1 GraphQL POST request')
    resultCode = 1
  } else {
    throw new Error(`Unexpected GraphQL POST count: ${requestCount}`)
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  await stopChild(nextProcess)
  await closeServer(graphQLServer)
}

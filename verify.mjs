import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'

const cwd = new URL('.', import.meta.url).pathname
const output = []
let server
let finalCode = 2

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    child.stdout.on('data', (chunk) => output.push(chunk.toString()))
    child.stderr.on('data', (chunk) => output.push(chunk.toString()))
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

async function freePort() {
  const listener = net.createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const { port } = listener.address()
  listener.close()
  await once(listener, 'close')
  return port
}

async function request(url) {
  const response = await fetch(url, { redirect: 'manual' })
  return { status: response.status, body: await response.text() }
}

async function waitForHealth(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`server exited early with code ${server.exitCode}`)
    }
    try {
      const result = await request(`${baseUrl}/_health`)
      if (result.status === 200 && result.body === 'ok') return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('server did not become healthy')
}

try {
  const build = await run(process.execPath, ['./node_modules/next/dist/bin/next', 'build'])
  if (build.code !== 0) {
    throw new Error(`next build failed (${build.code ?? build.signal})`)
  }

  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['server.js'], {
    cwd,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => output.push(chunk.toString()))
  server.stderr.on('data', (chunk) => output.push(chunk.toString()))

  await waitForHealth(baseUrl, 60_000)
  const result = await request(`${baseUrl}/a`)
  const rendered = result.status === 200 && result.body.includes('ROUTE_A_CONTENT')
  const isNext404 = result.status === 404 && /404|page could not be found/i.test(result.body)

  if (rendered) {
    console.log('SYMPTOM_ABSENT: custom app.render returned the /a page (status 200)')
    finalCode = 1
  } else if (isNext404) {
    console.log('SYMPTOM_PRESENT: healthy custom server returned Next.js 404 for explicit app.render("/a")')
    finalCode = 0
  } else {
    throw new Error(`unexpected /a response: status=${result.status} marker=${result.body.includes('ROUTE_A_CONTENT')}`)
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  if (output.length) console.error(output.join('').slice(-8000))
  finalCode = 2
} finally {
  process.exitCode = finalCode
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit')
    server.kill('SIGTERM')
    let timeout
    await Promise.race([
      exited,
      new Promise((resolve) => {
        timeout = setTimeout(resolve, 5000)
      }),
    ])
    clearTimeout(timeout)
    if (server.exitCode === null) {
      server.kill('SIGKILL')
      await exited
    }
  }
}

import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'

const cwd = new URL('.', import.meta.url).pathname
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...options.env },
      stdio: options.stdio || 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js server exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for the Next.js server')
}

function startQueryStrippingProxy(upstreamOrigin) {
  return new Promise((resolve, reject) => {
    const proxy = http.createServer(async (request, response) => {
      try {
        const incoming = new URL(request.url || '/', 'http://proxy.local')
        const upstream = await fetch(upstreamOrigin + incoming.pathname, {
          redirect: 'manual',
          signal: AbortSignal.timeout(15_000),
        })
        response.statusCode = upstream.status
        const contentType = upstream.headers.get('content-type')
        if (contentType) response.setHeader('content-type', contentType)
        response.end(Buffer.from(await upstream.arrayBuffer()))
      } catch (error) {
        response.statusCode = 502
        response.end(String(error))
      }
    })
    proxy.once('error', reject)
    proxy.listen(0, '127.0.0.1', () => {
      const address = proxy.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ proxy, origin: `http://127.0.0.1:${port}` })
    })
  })
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 5_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function closeProxy(proxy) {
  if (!proxy) return
  await new Promise((resolve, reject) => proxy.close((error) => (error ? reject(error) : resolve())))
}

let server
let proxy
try {
  const build = await run(process.execPath, [nextBin, 'build'])
  if (build.code !== 0) {
    console.error(`CHECK_FAILED: next build exited with ${build.code ?? build.signal}`)
    process.exitCode = 2
  } else {
    const port = await reservePort()
    const origin = `http://127.0.0.1:${port}`
    server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'inherit',
    })
    await waitForServer(origin, server)

    const optimizerPath = '/_next/image?url=%2Fsource.png&w=64&q=75'
    const directResponse = await fetch(origin + optimizerPath, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    })
    await directResponse.arrayBuffer()
    if (!directResponse.ok || !directResponse.headers.get('content-type')?.includes('image/')) {
      throw new Error(`Direct optimizer control failed with ${directResponse.status}`)
    }

    const deployment = await startQueryStrippingProxy(origin)
    proxy = deployment.proxy
    const response = await fetch(deployment.origin + optimizerPath, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    })
    const body = await response.text()
    const missingUrlError = response.status === 400 && /["']?url["']? parameter is required/i.test(body)

    if (missingUrlError) {
      console.log(`SYMPTOM_PRESENT: deployment request ${optimizerPath} returned 400 with ${JSON.stringify(body)} after its proxy dropped the query string; direct upstream control returned ${directResponse.status}`)
      process.exitCode = 0
    } else {
      console.log(`SYMPTOM_ABSENT: query-stripping deployment returned ${response.status} ${JSON.stringify(body.slice(0, 500))}`)
      process.exitCode = 1
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  process.exitCode = 2
} finally {
  await closeProxy(proxy)
  if (server) await stopServer(server)
}

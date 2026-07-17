import { spawn } from 'node:child_process'
import net from 'node:net'

const cwd = new URL('.', import.meta.url)
let child
let logs = ''

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function record(chunk) {
  logs += chunk.toString()
  if (logs.length > 12000) logs = logs.slice(-12000)
}

async function waitForServer(origin) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited during startup with code ${child.exitCode}\n${logs}`)
    }
    try {
      const response = await fetch(origin, { redirect: 'manual' })
      if (response.status < 500) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js\n${logs}`)
}

function stylesheetFrom(html) {
  const match = html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']stylesheet["']/i)
  return match?.[1]
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

async function check() {
  const port = await reservePort()
  const origin = `http://127.0.0.1:${port}`
  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', record)
  child.stderr.on('data', record)

  await waitForServer(origin)

  const pageResponse = await fetch(origin, { redirect: 'manual' })
  const pageHtml = await pageResponse.text()
  const stylesheet = stylesheetFrom(pageHtml)
  if (stylesheet !== '/tailwind.css') {
    throw new Error(`Expected /tailwind.css in rewritten page HTML, got ${stylesheet ?? 'none'}\n${pageHtml.slice(0, 1000)}`)
  }

  const unauthenticatedResponse = await fetch(new URL(stylesheet, origin), { redirect: 'manual' })
  const unauthenticatedType = unauthenticatedResponse.headers.get('content-type') ?? ''
  const unauthenticatedBody = await unauthenticatedResponse.text()

  const authenticatedResponse = await fetch(new URL(stylesheet, origin), {
    headers: { cookie: 'access-cookie=granted' },
    redirect: 'manual',
  })
  const authenticatedType = authenticatedResponse.headers.get('content-type') ?? ''
  const authenticatedBody = await authenticatedResponse.text()

  const cssMarker = 'rgb(12, 34, 56)'
  const baselineIsCss = authenticatedResponse.ok
    && authenticatedType.includes('text/css')
    && authenticatedBody.includes(cssMarker)
  if (!baselineIsCss) {
    throw new Error(`Authenticated baseline did not return the expected CSS: status=${authenticatedResponse.status}, content-type=${authenticatedType}, body=${authenticatedBody.slice(0, 300)}`)
  }

  const symptomPresent = unauthenticatedResponse.ok
    && unauthenticatedType.includes('text/html')
    && unauthenticatedBody.includes('data-page="login"')
    && !unauthenticatedBody.includes(cssMarker)

  console.log(JSON.stringify({
    stylesheet,
    unauthenticated: { status: unauthenticatedResponse.status, contentType: unauthenticatedType },
    authenticated: { status: authenticatedResponse.status, contentType: authenticatedType },
    symptomPresent,
  }))
  return symptomPresent ? 0 : 1
}

try {
  process.exitCode = await check()
} catch (error) {
  console.error(error?.stack ?? error)
  process.exitCode = 2
} finally {
  await stopServer()
}

import { spawn } from 'node:child_process'

const cwd = new URL('.', import.meta.url).pathname
const port = 31000 + (process.pid % 10000)
let server = null
let output = ''
let finalCode = 2

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let text = ''
    child.stdout.on('data', (chunk) => {
      text += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      text += chunk
      process.stderr.write(chunk)
    })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, text }))
  })
}

async function waitForServer(child) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited before becoming ready with code ${child.exitCode}`)
    }
    if (output.includes('[repro-ready]')) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('server did not become ready within 60 seconds')
}

async function request(path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  return {
    status: response.status,
    cookie: response.headers.get('set-cookie'),
    body: await response.text(),
  }
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const closed = new Promise((resolve) => child.once('close', resolve))
  const timer = setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL')
  }, 5_000)
  await closed
  clearTimeout(timer)
}

try {
  const build = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'])
  if (build.code !== 0) {
    console.error(`[verify-failed] build exited with ${build.code ?? build.signal}`)
  } else {
    server = spawn(process.execPath, ['server.mjs'], {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })
    server.stderr.on('data', (chunk) => {
      output += chunk
      process.stderr.write(chunk)
    })

    await waitForServer(server)
    const after = await request('/')
    const before = await request('/?order=before')
    await new Promise((resolve) => setTimeout(resolve, 200))

    const afterServedPage = after.status === 200 && after.body.includes('reproduction-ready')
    const beforeServedPage = before.status === 200 && before.body.includes('reproduction-ready')
    const afterAttempted = output.includes('[after-handle-set-header-succeeded]') || output.includes('[after-handle-set-header-error]')
    const beforeCookieWorked = before.cookie?.includes('sessionId=before123') === true
    const afterCookieWorked = after.cookie?.includes('sessionId=after123') === true

    console.log(JSON.stringify({
      after: { status: after.status, cookie: after.cookie, servedPage: afterServedPage },
      before: { status: before.status, cookie: before.cookie, servedPage: beforeServedPage },
      afterAttempted,
    }))

    if (!afterServedPage || !beforeServedPage || !afterAttempted || !beforeCookieWorked) {
      console.error('[verify-failed] request or custom-server control observation was incomplete')
    } else if (!afterCookieWorked) {
      console.log('[symptom-present] Set-Cookie is absent when set after handle(req, res), while setting it before handle works')
      finalCode = 0
    } else {
      console.log('[symptom-absent] Set-Cookie reaches the response when set after handle(req, res)')
      finalCode = 1
    }
  }
} catch (error) {
  console.error('[verify-failed]', error)
} finally {
  process.exitCode = finalCode
  await stopServer(server)
}

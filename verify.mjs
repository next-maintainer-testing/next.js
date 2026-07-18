import { spawn } from 'node:child_process'
import net from 'node:net'

const marker = 'optional-route-ok'
const unsupportedPattern = /Optional route parameters are not yet supported \("\[\[lang\]\]"\)/
const readyPattern = /(?:started server on|Ready in|✓ Ready)/i

const port = await new Promise((resolve, reject) => {
  const probe = net.createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address()
    probe.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: new URL('.', import.meta.url).pathname,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let output = ''
let settled = false
let routeCheckStarted = false
let childExited = false

const childExit = new Promise((resolve) => {
  child.once('exit', (code, signal) => {
    childExited = true
    resolve({ code, signal })
  })
})

function append(chunk) {
  const text = chunk.toString()
  output = (output + text).slice(-100000)
  process.stdout.write(text)

  if (unsupportedPattern.test(output)) {
    void finish(0, 'Observed the reported optional route parameter startup error.')
  } else if (readyPattern.test(output) && !routeCheckStarted) {
    routeCheckStarted = true
    void checkRoutes()
  }
}

child.stdout.on('data', append)
child.stderr.on('data', append)
child.once('error', (error) => {
  void finish(2, `Failed to start Next.js: ${error.message}`)
})

async function fetchRoute(pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    signal: AbortSignal.timeout(15000)
  })
  return { status: response.status, body: await response.text() }
}

async function checkRoutes() {
  await new Promise((resolve) => setTimeout(resolve, 1200))
  try {
    const root = await fetchRoute('/')
    const localized = await fetchRoute('/fr')
    const combined = `${root.body}\n${localized.body}\n${output}`

    if (unsupportedPattern.test(combined) || root.status === 404 || localized.status === 404) {
      await finish(0, `Optional segment failed to match both routes (statuses: /=${root.status}, /fr=${localized.status}).`)
      return
    }

    if (root.status === 200 && localized.status === 200 && root.body.includes(marker) && localized.body.includes(marker)) {
      await finish(1, 'Optional segment served both / and /fr; the reported symptom is absent.')
      return
    }

    await finish(2, `Unexpected route results (statuses: /=${root.status}, /fr=${localized.status}).`)
  } catch (error) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (unsupportedPattern.test(output)) {
      await finish(0, 'Observed the reported optional route parameter error while requesting the routes.')
    } else {
      await finish(2, `Route check failed unexpectedly: ${error.message}`)
    }
  }
}

async function cleanup() {
  if (childExited) return
  child.kill('SIGTERM')
  await Promise.race([
    childExit,
    new Promise((resolve) => setTimeout(resolve, 5000))
  ])
  if (!childExited) {
    child.kill('SIGKILL')
    await childExit
  }
}

async function finish(code, message) {
  if (settled) return
  settled = true
  process.exitCode = code
  clearTimeout(deadline)
  console.log(`\nVERIFY: ${message}`)
  await cleanup()
}

childExit.then(({ code, signal }) => {
  if (!settled) {
    const detail = signal ? `signal ${signal}` : `code ${code}`
    void finish(unsupportedPattern.test(output) ? 0 : 2, `Next.js exited unexpectedly with ${detail}.`)
  }
})

const deadline = setTimeout(() => {
  void finish(2, 'Timed out waiting for Next.js and the route checks.')
}, 60000)

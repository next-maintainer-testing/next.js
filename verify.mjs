import { spawn } from 'node:child_process'
import process from 'node:process'

const port = 31000 + (process.pid % 10000)
const origin = `http://127.0.0.1:${port}`
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
let output = ''

const server = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
})

for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-1_000_000)
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function requestRoute() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(`${origin}/assessment/results/6`, {
      redirect: 'manual',
      signal: controller.signal,
    })
    return { status: response.status, body: await response.text() }
  } finally {
    clearTimeout(timer)
  }
}

async function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) return

  const signal = (name) => {
    try {
      if (process.platform !== 'win32') process.kill(-server.pid, name)
      else server.kill(name)
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error
    }
  }

  signal('SIGTERM')
  for (let attempt = 0; attempt < 30; attempt++) {
    if (server.exitCode !== null || server.signalCode !== null) return
    await sleep(100)
  }
  signal('SIGKILL')
  for (let attempt = 0; attempt < 30; attempt++) {
    if (server.exitCode !== null || server.signalCode !== null) return
    await sleep(100)
  }
  throw new Error('Next.js dev server did not stop')
}

let observation
let exitCode = 2

try {
  const deadline = Date.now() + 120_000
  let lastError

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js dev server exited with code ${server.exitCode}\n${output}`)
    }

    try {
      observation = await requestRoute()
      break
    } catch (error) {
      lastError = error
      await sleep(500)
    }
  }

  if (!observation) {
    throw new Error(`Timed out requesting the dynamic route: ${lastError}\n${output}`)
  }

  // Include server output because the development error can be rendered in the
  // response overlay, printed by Next.js, or both.
  const evidence = `${observation.body}\n${output}`
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/&quot;|&#x27;|&apos;/g, '"')
    .replace(/\s+/g, ' ')

  const hasMissingParamError =
    /missing param[^]*generateStaticParams\(\)/i.test(evidence) &&
    /required[^]*output:?\s*["']?export/i.test(evidence)
  const renderedDynamically =
    observation.status === 200 && /Assessment result\s*<!-- -->?\s*6|Assessment result 6/.test(observation.body)

  if (hasMissingParamError) {
    exitCode = 0
    console.log(`REPRODUCED: GET /assessment/results/6 was rejected (HTTP ${observation.status}) as missing from generateStaticParams() with output: export.`)
  } else if (renderedDynamically) {
    exitCode = 1
    console.log('NOT REPRODUCED: GET /assessment/results/6 rendered Assessment result 6.')
  } else {
    console.error(`CHECK FAILED: Unexpected HTTP ${observation.status}.\n${evidence.slice(-8000)}`)
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error?.stack || error}`)
} finally {
  // Make the result durable before releasing the server process and its handles.
  process.exitCode = exitCode
  try {
    await stopServer()
  } catch (error) {
    process.exitCode = 2
    console.error(`CHECK FAILED during cleanup: ${error?.stack || error}`)
  }
}

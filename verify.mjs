import { spawn } from 'node:child_process'

const port = 32000 + (process.pid % 1000)
const baseUrl = `http://127.0.0.1:${port}`
let child
let childExit
let output = ''
let result = 2

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForExit(ms) {
  if (!child || child.exitCode !== null) return true
  let timer
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), ms)
  })
  const exited = childExit.then(() => true)
  const finished = await Promise.race([exited, timedOut])
  clearTimeout(timer)
  return finished
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  if (!(await waitForExit(5000))) {
    child.kill('SIGKILL')
    await childExit
  }
}

try {
  child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)],
    { cwd: new URL('.', import.meta.url), env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
  )
  childExit = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
    child.once('error', (error) => resolve({ error }))
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      output = (output + chunk.toString()).slice(-12000)
    })
  }

  let ready = false
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) break
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2000) })
      if (response.ok) {
        ready = true
        break
      }
    } catch {}
    await delay(250)
  }
  if (!ready) {
    throw new Error(`Next.js server did not become ready.\n${output}`)
  }

  const response = await fetch(`${baseUrl}/missing`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  })
  const body = await response.text()
  if (!body.includes('NOT_FOUND_MARKER_59521')) {
    throw new Error(`Expected not-found marker was missing (status ${response.status}).`)
  }

  if (response.status === 200) {
    console.log('SYMPTOM_PRESENT: /missing rendered the not-found UI with HTTP 200.')
    result = 0
  } else {
    console.log(`SYMPTOM_ABSENT: /missing rendered the not-found UI with HTTP ${response.status}.`)
    result = 1
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}\n${output}`)
  result = 2
} finally {
  process.exitCode = result
  await stopServer()
}

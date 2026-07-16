import { spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'

const port = 31279
const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})\n${output}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/en`, {
        signal: AbortSignal.timeout(5_000),
      })
      if (response.status < 500) return
    } catch {}
    await delay(500)
  }
  throw new Error(`Timed out waiting for Next.js\n${output}`)
}

async function stopServer() {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 10_000)
  try {
    await once(child, 'close')
  } finally {
    clearTimeout(killTimer)
  }
}

try {
  await waitForServer()
  const response = await fetch(`http://127.0.0.1:${port}/de/docs`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.text()
  const renderedText = body.replaceAll('<!-- -->', '')

  if (response.status === 404) {
    console.log('Symptom absent: /de/docs returned the expected 404')
    process.exitCode = 1
  } else if (response.status === 200 && renderedText.includes('unexpected-dynamic-locale:de:docs')) {
    console.log('Symptom present: /de/docs rendered with status 200 despite dynamicParams=false and only locale=en being generated')
    process.exitCode = 0
  } else {
    console.error(`Check failed: /de/docs returned status ${response.status} without the expected route marker`)
    console.error(body.slice(0, 1000))
    process.exitCode = 2
  }
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  await stopServer()
}

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')
const port = 31000 + (process.pid % 1000)
const origin = `http://127.0.0.1:${port}`
let output = ''

const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-12000)
  })
}

async function fetchUntilReady(pathname, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})\n${output}`)
    }
    try {
      return await fetch(`${origin}${pathname}`)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError}\n${output}`)
}

async function stopServer() {
  if (child.exitCode !== null) return
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

try {
  const homeResponse = await fetchUntilReady('/en/')
  const homeBody = await homeResponse.text()
  if (homeResponse.status !== 200 || !homeBody.includes('valid-lang-page')) {
    throw new Error(`Control route failed: status=${homeResponse.status}, marker=${homeBody.includes('valid-lang-page')}\n${output}`)
  }

  const missingResponse = await fetch(`${origin}/en/pricing/`)
  const missingBody = await missingResponse.text()
  if (missingResponse.status !== 404) {
    throw new Error(`Missing route did not return 404: status=${missingResponse.status}\n${output}`)
  }

  const customNotFoundRendered = missingBody.includes('nested-lang-not-found-marker')
  const defaultNotFoundRendered = missingBody.includes('This page could not be found')

  if (customNotFoundRendered) {
    console.log('SYMPTOM_ABSENT: /en/pricing/ rendered app/[lang]/not-found.jsx')
    process.exitCode = 1
  } else if (defaultNotFoundRendered) {
    console.log('SYMPTOM_PRESENT: /en/pricing/ rendered the default Next.js 404 instead of app/[lang]/not-found.jsx')
    process.exitCode = 0
  } else {
    throw new Error(`404 response rendered neither the custom marker nor the recognizable default 404\n${missingBody.slice(0, 2000)}\n${output}`)
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  process.exitCode = 2
} finally {
  await stopServer()
}

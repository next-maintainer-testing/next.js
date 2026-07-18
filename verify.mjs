import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const appDir = path.join(root, 'apps', 'web')
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const port = 21000 + (process.pid % 10000)
let child
let exitCode = 2
let output = ''

function remember(chunk) {
  output += chunk.toString()
  if (output.length > 16000) output = output.slice(-16000)
}

async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const stopped = new Promise((resolve) => child.once('exit', resolve))
  const grace = new Promise((resolve) => setTimeout(resolve, 5000))
  await Promise.race([stopped, grace])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

async function fetchCompilationError() {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js exited before serving the page (${child.exitCode ?? child.signalCode})`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      })
      const body = await response.text()
      if (body.includes("Can't resolve './not-existing'") || body.includes('not-existing')) {
        return { status: response.status, body }
      }
    } catch (error) {
      if (error?.name !== 'TypeError' && error?.name !== 'TimeoutError') throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for the intentional missing-module compilation error')
}

try {
  await access(nextBin)
  child = spawn(process.execPath, [nextBin, 'dev', '--turbopack', '--port', String(port)], {
    cwd: appDir,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', remember)
  child.stderr.on('data', remember)

  const { status, body } = await fetchCompilationError()
  const hasExpectedError = status === 500 && body.includes('not-existing') && body.includes('page.js')
  if (!hasExpectedError) {
    throw new Error(`The intentional compile error was not returned as a 500 response (status ${status})`)
  }

  const wrongMonorepoRelativePath = body.includes('./apps/web/app/page.js')
  const appRelativePath = body.includes('./app/page.js')
  if (wrongMonorepoRelativePath) {
    console.log('SYMPTOM PRESENT: the dev error payload uses ./apps/web/app/page.js instead of a path relative to apps/web')
    exitCode = 0
  } else {
    console.log(`SYMPTOM ABSENT: the dev error payload does not use ./apps/web/app/page.js${appRelativePath ? ' and uses ./app/page.js' : ''}`)
    exitCode = 1
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error?.stack || error}`)
  if (output) console.error(`Next.js output:\n${output}`)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  await stopChild()
}

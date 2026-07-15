import { spawn } from 'node:child_process'

const port = 32144
const origin = `http://127.0.0.1:${port}`
const isWindows = process.platform === 'win32'
const child = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: process.cwd(),
  detached: !isWindows,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => { output += chunk.toString() })
child.stderr.on('data', (chunk) => { output += chunk.toString() })

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function signalChild(signal) {
  try {
    if (isWindows) child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

function waitForExit(timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

async function stopChild() {
  if (child.exitCode !== null || child.signalCode !== null) return
  signalChild('SIGTERM')
  if (!(await waitForExit(5000))) {
    signalChild('SIGKILL')
    await waitForExit(5000)
  }
}

try {
  const deadline = Date.now() + 90000
  let response
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited with ${child.exitCode}`)
    try {
      response = await fetch(origin)
      break
    } catch {}
    await delay(500)
  }

  if (!response) throw new Error('Timed out waiting for the development server')
  const html = await response.text()
  await delay(500)

  const knownCompileFailure = response.status === 500
    && output.includes('Parsing CSS source code failed')
    && output.includes("'export' is not recognized as a valid pseudo-class")
    && output.includes('app/variables.module.scss')
  const missingExport = response.ok
    && html.includes('data-primary-color="missing"')
    && html.includes('>missing</main>')
  const featureWorks = response.ok
    && html.includes('data-primary-color="#64ff00"')
    && html.includes('>#64ff00</main>')

  if (!knownCompileFailure && !missingExport && !featureWorks) {
    throw new Error(`Unexpected HTTP ${response.status}; HTML: ${html.slice(0, 1000)}`)
  }

  const symptomPresent = knownCompileFailure || missingExport
  console.log(symptomPresent
    ? `SYMPTOM PRESENT: Turbopack did not provide the Sass :export value (${knownCompileFailure ? 'CSS parse failure' : 'missing export'}).`
    : 'SYMPTOM ABSENT: Sass :export produced #64ff00.')
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(`CHECK FAILED: ${error.message}`)
  console.error(output.slice(-5000))
  process.exitCode = 2
} finally {
  await stopChild()
}

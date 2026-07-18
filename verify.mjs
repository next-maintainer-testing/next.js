import { spawn } from 'node:child_process'

const port = 32141
const base = `http://127.0.0.1:${port}`
let output = ''
let child

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})\n${output}`)
    }
    try {
      const response = await fetch(`${base}/`)
      if (response.status === 200) return
    } catch {}
    await sleep(500)
  }
  throw new Error(`Timed out waiting for Next.js\n${output}`)
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(10_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })

  await waitForServer()

  const control = await fetch(`${base}/pixel-grid`)
  const controlBody = await control.text()
  if (control.status !== 200 || !controlBody.includes('pixel-grid-slot-marker')) {
    throw new Error(`Control route failed: status=${control.status}, marker=${controlBody.includes('pixel-grid-slot-marker')}\n${output}`)
  }

  const literal = await fetch(`${base}/@grida/pixel-grid`)
  const symptomPresent = literal.status === 404
  console.log(JSON.stringify({
    controlPath: '/pixel-grid',
    controlStatus: control.status,
    controlMarker: true,
    literalPath: '/@grida/pixel-grid',
    literalStatus: literal.status,
    symptomPresent,
  }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  process.exitCode = 2
} finally {
  await stopServer()
}

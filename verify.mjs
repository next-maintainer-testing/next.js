import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const port = 32000 + Math.floor(Math.random() * 5000)
const origin = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk.toString() })
child.stderr.on('data', (chunk) => { logs += chunk.toString() })

async function waitForServer() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})\n${logs}`)
    }
    try {
      const response = await fetch(`${origin}/generate-metadata-redirect`)
      if (response.ok) return
    } catch {}
    await delay(250)
  }
  throw new Error(`Timed out waiting for Next.js\n${logs}`)
}

async function stopServer() {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(10_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  await waitForServer()
  const response = await fetch(`${origin}/`, {
    redirect: 'manual',
    headers: {
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
    },
  })
  const body = await response.text()
  const location = response.headers.get('location')
  const streamedRedirect =
    body.includes('NEXT_REDIRECT') &&
    body.includes('/generate-metadata-redirect')

  if (response.status === 200 && streamedRedirect) {
    console.log('SYMPTOM PRESENT: generateMetadata redirect returned HTTP 200 with a streamed client redirect instruction')
    process.exitCode = 0
  } else {
    console.log(`SYMPTOM ABSENT: status=${response.status} location=${location ?? '<none>'} streamedRedirect=${streamedRedirect}`)
    process.exitCode = 1
  }
} catch (error) {
  console.error('CHECK FAILED:', error)
  process.exitCode = 2
} finally {
  await stopServer()
}

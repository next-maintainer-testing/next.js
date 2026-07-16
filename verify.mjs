import { spawn } from 'node:child_process'
import process from 'node:process'

const port = 32000 + (process.pid % 1000)
const origin = `http://127.0.0.1:${port}`
let output = ''
let child

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function stopServer() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const forced = delay(5000).then(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  })
  await Promise.race([exited, forced])
  if (child.exitCode === null && child.signalCode === null) {
    await exited
  }
}

try {
  const nextBin = await import.meta.resolve('next/dist/bin/next')
  child = spawn(process.execPath, [new URL(nextBin).pathname, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) break
    try {
      const response = await fetch(`${origin}/app/home`)
      if (response.status === 200) {
        ready = true
        break
      }
    } catch {}
    await delay(250)
  }

  if (!ready) {
    console.error(`CHECK_FAILED: Next.js did not become ready\n${output}`)
    process.exitCode = 2
  } else {
    const response = await fetch(`${origin}/app/route`, { redirect: 'manual' })
    const location = response.headers.get('location')
    if (response.status < 300 || response.status >= 400 || !location) {
      console.error(`CHECK_FAILED: expected a redirect response, got status=${response.status} location=${location}`)
      process.exitCode = 2
    } else {
      const pathname = new URL(location, origin).pathname
      console.log(`OBSERVED: status=${response.status} location=${location} pathname=${pathname}`)
      if (pathname === '/home') {
        console.log('SYMPTOM_PRESENT: route-handler redirect omitted configured basePath /app')
        process.exitCode = 0
      } else if (pathname === '/app/home') {
        console.log('SYMPTOM_ABSENT: route-handler redirect included configured basePath /app')
        process.exitCode = 1
      } else {
        console.error(`CHECK_FAILED: unexpected redirect pathname ${pathname}`)
        process.exitCode = 2
      }
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  process.exitCode = 2
} finally {
  await stopServer()
}

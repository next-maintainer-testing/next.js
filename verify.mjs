import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const host = '127.0.0.1'
const port = 31980
const baseUrl = `http://${host}:${port}`
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
let output = ''
let server

function retain(chunk) {
  output = (output + chunk.toString()).slice(-20000)
}

async function request(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`)
  return { status: response.status, body: await response.text() }
}

async function waitUntilReady() {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})`)
    }
    try {
      const result = await request('/group-dir')
      if (result.status < 500) return
    } catch {}
    await delay(250)
  }
  throw new Error('Timed out waiting for Next.js to become ready')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  const closed = new Promise((resolve) => server.once('close', resolve))
  server.kill('SIGTERM')
  await Promise.race([closed, delay(10000)])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('close', resolve))
  }
}

try {
  server = spawn(process.execPath, [nextBin, 'dev', '--hostname', host, '--port', String(port)], {
    cwd: new URL('.', import.meta.url).pathname,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', retain)
  server.stderr.on('data', retain)

  await waitUntilReady()
  const trigger = await request('/group-dir/trigger')
  const unmatched = await request('/group-dir/unmatched')
  const triggerUsesLocalBoundary = trigger.status === 404 && trigger.body.includes('LOCAL_GROUP_NOT_FOUND_54980')
  const unmatchedUsesLocalBoundary = unmatched.body.includes('LOCAL_GROUP_NOT_FOUND_54980')
  const symptomPresent = triggerUsesLocalBoundary && unmatched.status === 404 && !unmatchedUsesLocalBoundary

  console.log(JSON.stringify({
    triggerStatus: trigger.status,
    triggerUsesLocalBoundary,
    unmatchedStatus: unmatched.status,
    unmatchedUsesLocalBoundary,
    unmatchedUsesRootBoundary: unmatched.body.includes('ROOT_NOT_FOUND_54980'),
    symptomPresent,
  }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  console.error(output)
  process.exitCode = 2
} finally {
  await stopServer()
}

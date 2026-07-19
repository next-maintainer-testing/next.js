import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const host = '127.0.0.1'
const port = 32137
const url = `http://${host}:${port}/`
let output = ''
let child

function append(chunk) {
  output += chunk.toString()
  if (output.length > 12000) output = output.slice(-12000)
}

async function stopChild() {
  if (!child || child.exitCode !== null) return

  const closed = new Promise((resolve) => child.once('close', resolve))
  child.kill('SIGTERM')
  const graceful = await Promise.race([
    closed.then(() => true),
    delay(5000).then(() => false),
  ])

  if (!graceful && child.exitCode === null) {
    child.kill('SIGKILL')
    await closed
  }
}

async function fetchRenderedPage() {
  const deadline = Date.now() + 90000
  let lastError

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${child.exitCode})\n${output}`)
    }

    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.ok) return await response.text()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await delay(250)
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError}\n${output}`)
}

try {
  child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '-H', host, '-p', String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  const html = await fetchRenderedPage()
  if (!html.includes('issue-54437-marker')) {
    throw new Error(`The expected page was not rendered.\n${html.slice(0, 2000)}\n${output}`)
  }

  const hasRefresh = /<meta\s+[^>]*http-equiv=["']refresh["'][^>]*>/i.test(html)
  if (hasRefresh) {
    console.log('The rendered HTML includes a meta http-equiv="refresh" element.')
    process.exitCode = 1
  } else {
    console.log('The rendered HTML omits meta http-equiv="refresh" despite the Metadata API value.')
    process.exitCode = 0
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  await stopChild()
}

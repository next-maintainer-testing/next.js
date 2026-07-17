import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const port = 34000 + Math.floor(Math.random() * 1000)
const output = []
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => output.push(chunk.toString()))
}

const url = (pathname) => `http://127.0.0.1:${port}${pathname}`

async function request(pathname) {
  const response = await fetch(url(pathname))
  await response.arrayBuffer()
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`)
}

async function waitUntilReady() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited with ${child.exitCode}`)
    try {
      await request('/')
      return
    } catch {
      await delay(250)
    }
  }
  throw new Error('next dev did not become ready within 90 seconds')
}

async function stopServer() {
  if (child.exitCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    delay(5_000).then(() => {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {}
    }),
  ])
}

try {
  await waitUntilReady()
  await delay(1_500)

  const homeStart = output.length
  await request('/')
  await delay(1_500)
  const homeReloadOutput = output.slice(homeStart).join('')

  await request('/123456')
  await delay(1_500)
  const dynamicStart = output.length
  await request('/123456')
  await delay(2_500)
  const dynamicReloadOutput = output.slice(dynamicStart).join('')

  const resetMarker = 'ISSUE84198_MODULE_EVAL previous=undefined'
  const homeReset = homeReloadOutput.includes(resetMarker)
  const dynamicReset = dynamicReloadOutput.includes(resetMarker)

  console.log(`home refresh reset module state: ${homeReset}`)
  console.log(`dynamic refresh reset module state: ${dynamicReset}`)
  console.log('dynamic refresh output:')
  console.log(dynamicReloadOutput.trim())

  process.exitCode = dynamicReset && !homeReset ? 0 : 1
} catch (error) {
  console.error(error)
  console.error(output.join(''))
  process.exitCode = 2
} finally {
  await stopServer()
}

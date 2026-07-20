import { spawn } from 'node:child_process'
import net from 'node:net'

const port = 39331
const host = '127.0.0.1'
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', host, '--port', String(port)], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    const text = chunk.toString()
    logs += text
    process.stdout.write(text)
  })
}

const childClosed = new Promise((resolve) => child.once('close', resolve))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForPort() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before listening (code ${child.exitCode})`)
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => resolve(false))
      socket.setTimeout(500, () => {
        socket.destroy()
        resolve(false)
      })
    })
    if (connected) return
    await sleep(200)
  }
  throw new Error('Timed out waiting for the Next.js server')
}

async function check() {
  await waitForPort()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  const response = await fetch(`http://${host}:${port}/image`, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: png,
    signal: AbortSignal.timeout(90_000),
  })
  const body = await response.text()
  await sleep(500)

  const nativeAddonParseError = /Module parse failed: Unexpected character/.test(logs) && /\.node\b/.test(logs)
  const metadataReturned = response.ok && /(?:width|height|format)/i.test(body)

  console.log(`VERIFICATION_RESPONSE status=${response.status} body=${JSON.stringify(body.slice(0, 500))}`)
  console.log(`VERIFICATION_SIGNATURE nativeAddonParseError=${nativeAddonParseError} metadataReturned=${metadataReturned}`)

  if (response.status >= 500 && nativeAddonParseError) return 0
  if (metadataReturned || !nativeAddonParseError) return 1
  throw new Error(`Ambiguous response: HTTP ${response.status}`)
}

let result = 2
try {
  result = await check()
} catch (error) {
  console.error('VERIFICATION_CHECK_FAILED', error)
}

process.exitCode = result
if (child.exitCode === null) child.kill('SIGTERM')
await Promise.race([childClosed, sleep(10_000)])
if (child.exitCode === null) {
  child.kill('SIGKILL')
  await childClosed
}

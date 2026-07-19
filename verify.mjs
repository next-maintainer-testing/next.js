import { spawn } from 'node:child_process'
import { once } from 'node:events'
import net from 'node:net'

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const port = await reservePort()
const origin = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk })
child.stderr.on('data', (chunk) => { logs += chunk })

let outcome = 2
try {
  let response
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early (${child.exitCode})\n${logs}`)
    try {
      response = await fetch(`${origin}/base-path`)
      if (response.ok) break
    } catch {}
    await sleep(250)
  }
  if (!response?.ok) throw new Error(`page did not become ready\n${logs}`)

  const html = await response.text()
  const imageTag = html.match(/<img\b[^>]*\balt="pixel"[^>]*>/)?.[0]
  if (!imageTag) throw new Error(`rendered page did not contain the expected image\n${html.slice(0, 2000)}`)
  const encodedSrc = imageTag.match(/\bsrc="([^"]+)"/)?.[1]
  if (!encodedSrc) throw new Error(`image did not have a src attribute\n${imageTag}`)
  const src = encodedSrc.replaceAll('&amp;', '&')
  const doubled = src.startsWith('/base-path/base-path/_next/image?')
  const imageResponse = await fetch(new URL(src, origin), { redirect: 'manual' })
  const resulting404 = imageResponse.status === 404

  console.log(JSON.stringify({ src, imageStatus: imageResponse.status, doubledBasePath: doubled }))
  outcome = doubled && resulting404 ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  outcome = 2
} finally {
  process.exitCode = outcome
  if (child.exitCode === null) child.kill('SIGTERM')
  if (child.exitCode === null) {
    await Promise.race([
      once(child, 'exit'),
      sleep(5_000).then(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      }),
    ])
  }
}

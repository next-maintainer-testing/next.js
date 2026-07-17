import { spawn } from 'node:child_process'
import { once } from 'node:events'

const port = 41000 + (process.pid % 1000)
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
let child
let output = ''
let result = 2

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([once(child, 'close'), delay(5000)])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await once(child, 'close')
  }
}

try {
  child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      output = (output + chunk.toString()).slice(-12000)
    })
  }

  const deadline = Date.now() + 90000
  let html = null
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited early with code ${child.exitCode}\n${output}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      if (response.ok) {
        html = await response.text()
        break
      }
    } catch {
      // The dev server is still starting.
    }
    await delay(250)
  }

  if (html === null) throw new Error(`Timed out waiting for Next.js\n${output}`)
  const imageTag = html.match(/<img\b[^>]*alt="optimization-probe"[^>]*>/)?.[0]
  if (!imageTag) throw new Error(`Rendered probe image was not found\n${html.slice(0, 4000)}`)

  const usesOptimizer = imageTag.includes('/_next/image?url=') || imageTag.includes('/_next/image?url%3D')
  const usesRawSource = imageTag.includes('src="/probe.png"')

  if (usesOptimizer) {
    console.log(`ABSENT: explicit unoptimized={false} rendered an optimized URL: ${imageTag}`)
    result = 1
  } else if (usesRawSource) {
    console.log(`PRESENT: explicit unoptimized={false} rendered the raw URL: ${imageTag}`)
    result = 0
  } else {
    throw new Error(`Probe image had an unexpected src\n${imageTag}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  result = 2
} finally {
  process.exitCode = result
  await stopServer()
}

import { spawn } from 'node:child_process'
import net from 'node:net'

const encoded =
  'src="https://picsum.photos/id/870/200/300?grayscale=1&amp;blur=2"'
const unencoded =
  'src="https://picsum.photos/id/870/200/300?grayscale=1&blur=2"'

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}

async function fetchDocument(url, child, logs) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (${child.exitCode})\n${logs()}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return await response.text()
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}\n${logs()}`)
}

async function stop(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) =>
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
        resolve()
      }, 10_000),
    ),
  ])
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

let child
try {
  const port = await availablePort()
  const chunks = []
  child = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
  )
  child.stdout.on('data', (chunk) => chunks.push(chunk.toString()))
  child.stderr.on('data', (chunk) => chunks.push(chunk.toString()))

  const html = await fetchDocument(
    `http://127.0.0.1:${port}/`,
    child,
    () => chunks.join('').slice(-8000),
  )

  if (html.includes(encoded)) {
    console.log('SYMPTOM_PRESENT: raw HTML image src contains &amp; between query parameters')
    process.exitCode = 0
  } else if (html.includes(unencoded)) {
    console.log('SYMPTOM_ABSENT: raw HTML image src preserves a literal & between query parameters')
    process.exitCode = 1
  } else {
    console.error(`CHECK_FAILED: expected image src was not found in raw HTML\n${html.slice(0, 4000)}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  process.exitCode = 2
} finally {
  if (child) await stop(child)
}

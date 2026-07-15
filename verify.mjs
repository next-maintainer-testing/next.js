import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'

const HOST = '127.0.0.1'
const EXPECTED_CORRECT = 'https://example.com/image.jpg?param1=value1&amp;param2=value2'
const REPORTED_BUG = 'https://example.com/image.jpg?param1=value1&amp;amp;param2=value2'

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, HOST, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    child.once('close', resolve)
  })
}

async function fetchUntilReady(url, child, output) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${child.exitCode}).\n${output.value}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return await response.text()
    } catch {
      // The development server may not have bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}.\n${output.value}`)
}

let child
let result = 2
try {
  const port = await reservePort()
  const nextVersion = createRequire(import.meta.url)('next/package.json').version
  const nextMajor = Number.parseInt(nextVersion.split('.')[0], 10)
  const args = ['node_modules/next/dist/bin/next', 'dev', '-H', HOST, '-p', String(port)]
  if (nextMajor >= 16) args.push('--webpack')

  const output = { value: '' }
  child = spawn(process.execPath, args, {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output.value += chunk })
  child.stderr.on('data', (chunk) => { output.value += chunk })

  const html = await fetchUntilReady(`http://${HOST}:${port}/`, child, output)
  if (html.includes(REPORTED_BUG)) {
    console.log(`REPRODUCED: Next.js ${nextVersion} server-rendered image URL contains ${REPORTED_BUG}`)
    result = 0
  } else if (html.includes(EXPECTED_CORRECT)) {
    console.log(`NOT_REPRODUCED: Next.js ${nextVersion} server-rendered image URL contains ${EXPECTED_CORRECT}`)
    result = 1
  } else {
    const image = html.match(/<img[^>]*>/)?.[0] ?? 'no <img> element found'
    throw new Error(`Unexpected rendered image markup: ${image}`)
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error instanceof Error ? error.stack : error}`)
  result = 2
} finally {
  process.exitCode = result
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    const graceful = waitForExit(child)
    const forced = new Promise((resolve) => {
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        resolve()
      }, 5_000)
    })
    await Promise.race([graceful, forced])
    await waitForExit(child)
  }
}

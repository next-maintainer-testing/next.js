import { spawn } from 'node:child_process'
import net from 'node:net'

const expectedBug = 'https://example.com/mypage/?someparams=true'
const expectedFixed = 'https://example.com/mypage?someparams=true'
let child

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function waitForPage(url) {
  const deadline = Date.now() + 90_000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return await response.text()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'unknown error'}`)
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  const port = await getFreePort()
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  let logs = ''
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })

  const html = await waitForPage(`http://127.0.0.1:${port}/mypage`)
  const canonicalTag = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0]
  const canonical = canonicalTag?.match(/\bhref=["']([^"']+)["']/i)?.[1]?.replaceAll('&amp;', '&')

  if (canonical === expectedBug) {
    console.log(`Symptom reproduced: canonical URL is ${canonical}`)
    process.exitCode = 0
  } else if (canonical === expectedFixed) {
    console.log(`Symptom absent: canonical URL is ${canonical}`)
    process.exitCode = 1
  } else {
    console.error(`Check failed: unexpected canonical URL ${JSON.stringify(canonical)}; tag=${JSON.stringify(canonicalTag)}`)
    console.error(logs)
    process.exitCode = 2
  }
} catch (error) {
  console.error(error.stack || error)
  process.exitCode = 2
} finally {
  await stopChild()
}

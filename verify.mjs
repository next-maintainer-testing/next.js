import net from 'node:net'
import { spawn } from 'node:child_process'

let child
let logs = ''

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchPage(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      const html = await response.text()
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${html.slice(0, 300)}`)
      return html
    } catch (error) {
      lastError = error
      if (child?.exitCode !== null) {
        throw new Error(`Next.js exited early (${child.exitCode}). Logs:\n${logs}`)
      }
      await delay(300)
    }
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}\nLogs:\n${logs}`)
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const deadline = delay(5000).then(() => 'timeout')
  if (await Promise.race([exited.then(() => 'exited'), deadline]) === 'timeout') {
    child.kill('SIGKILL')
    await exited
  }
}

try {
  const port = await reservePort()
  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { logs += chunk })
  child.stderr.on('data', (chunk) => { logs += chunk })

  const html = await fetchPage(`http://127.0.0.1:${port}/`, 120000)
  const anchor = html.match(/<a\b[^>]*\bid=["']about-link["'][^>]*>/i)?.[0]
    ?? html.match(/<a\b(?=[^>]*\bid=["']about-link["'])[^>]*>/i)?.[0]
  if (!anchor) throw new Error(`Could not find #about-link in HTML: ${html.slice(0, 1000)}`)
  const href = anchor.match(/\bhref=["']([^"']*)["']/i)?.[1]
  if (href === undefined) throw new Error(`Could not read href from anchor: ${anchor}`)

  if (/^\/en\/?#about$/.test(href)) {
    console.log(`Symptom present: rendered href is ${JSON.stringify(href)}`)
    process.exitCode = 0
  } else if (href === '#about') {
    console.log('Symptom absent: rendered href is "#about"')
    process.exitCode = 1
  } else {
    throw new Error(`Unexpected rendered href ${JSON.stringify(href)} in ${anchor}`)
  }
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  await stopChild()
}

import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import process from 'node:process'

const cwd = new URL('.', import.meta.url).pathname
let child
let exitCode = 2

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function matchingImagePreload(section) {
  return [...section.matchAll(/<link\b[^>]*>/gi)].some(({ 0: tag }) =>
    /\brel=["']preload["']/i.test(tag) &&
    /\bas=["']image["']/i.test(tag) &&
    /\bhref=["']\/fixture\.svg["']/i.test(tag)
  )
}

async function fetchPage(url) {
  let lastError
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.text()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    if (child.exitCode !== null) throw new Error(`next dev exited with ${child.exitCode}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError || new Error('Timed out waiting for Next.js')
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

try {
  const port = await freePort()
  child = spawn(process.execPath, [
    new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname,
    'dev', '--hostname', '127.0.0.1', '--port', String(port)
  ], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })

  const html = await fetchPage(`http://127.0.0.1:${port}/`)
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
  if (head === undefined || body === undefined) throw new Error('Response did not contain head and body elements')

  const inHead = matchingImagePreload(head)
  const inBody = matchingImagePreload(body)
  if (inBody) {
    console.log('SYMPTOM_PRESENT: plain img preload link was emitted inside body')
    exitCode = 0
  } else {
    console.log(`SYMPTOM_ABSENT: matching preload in head=${inHead}, in body=${inBody}`)
    exitCode = 1
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack || error}`)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  await stopChild()
}

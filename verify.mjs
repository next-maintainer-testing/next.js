import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

async function availablePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function decodeHtml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function signalTree(child, signal) {
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal)
    else child.kill(signal)
  } catch {
    if (child.exitCode === null) child.kill(signal)
  }
}

async function stop(child) {
  if (!child) return

  if (child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve))
    signalTree(child, 'SIGTERM')
    let timer
    const result = await Promise.race([
      exited.then(() => 'exit'),
      new Promise((resolve) => { timer = setTimeout(resolve, 5000, 'timeout') }),
    ])
    clearTimeout(timer)
    if (result === 'timeout' && child.exitCode === null) {
      signalTree(child, 'SIGKILL')
      await exited
    }
  }

  child.stdout?.destroy()
  child.stderr?.destroy()
}

let child
let logs = ''

try {
  const port = await availablePort()
  const nextBin = fileURLToPath(import.meta.resolve('next/dist/bin/next'))
  child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { logs += chunk })
  child.stderr.on('data', (chunk) => { logs += chunk })

  const deadline = Date.now() + 90000
  let response
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${child.exitCode})\n${logs}`)
    }
    try {
      response = await fetch(`http://127.0.0.1:${port}/`)
      if (response.ok) break
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  if (!response?.ok) {
    throw new Error(`Next.js did not serve the page: ${lastError?.message ?? 'timeout'}\n${logs}`)
  }

  const html = await response.text()
  const match = html.match(/<pre id="observation">([\s\S]*?)<\/pre>/)
  if (!match) throw new Error(`Observation element was missing\n${html.slice(0, 2000)}`)

  const observations = JSON.parse(decodeHtml(match[1]))
  if (!Array.isArray(observations) || observations.length !== 2) {
    throw new Error(`Unexpected observation payload: ${JSON.stringify(observations)}`)
  }

  const symptomPresent = observations.every((item) =>
    item && item.typeName !== 'Item' && item.displayName !== 'Item'
  )
  console.log(JSON.stringify({ symptomPresent, observations }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  await stop(child)
}

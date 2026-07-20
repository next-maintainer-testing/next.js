import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import net from 'node:net'

const cwd = new URL('.', import.meta.url).pathname
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
let server = null
let exitCode = 2

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
      process.stderr.write(chunk)
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal, output }))
  })
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer()
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address()
      const port = typeof address === 'object' && address ? address.port : null
      listener.close((error) => {
        if (error) reject(error)
        else if (port === null) reject(new Error('Could not reserve a port'))
        else resolve(port)
      })
    })
  })
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve()
    else child.once('exit', resolve)
  })
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`next start exited before becoming ready (code ${child.exitCode}, signal ${child.signalCode})`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`)
}

try {
  await rm(new URL('.next', import.meta.url), { recursive: true, force: true })
  const build = await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'])
  if (build.code !== 0) {
    throw new Error(`next build failed (code ${build.code}, signal ${build.signal})`)
  }

  const port = await reservePort()
  const url = `http://127.0.0.1:${port}/sitemap.xml`
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.pipe(process.stdout)
  server.stderr.pipe(process.stderr)

  const response = await waitForServer(url, server)
  const cacheControl = response.headers.get('cache-control') ?? ''
  const body = await response.text()
  if (!body.includes('<urlset')) {
    throw new Error(`Unexpected sitemap body: ${body.slice(0, 200)}`)
  }

  const symptomPresent = /(?:^|,\s*)max-age=0(?:\s*,|$)/i.test(cacheControl) && /(?:^|,\s*)must-revalidate(?:\s*,|$)/i.test(cacheControl)
  console.log(`Observed Cache-Control: ${cacheControl || '(missing)'}`)
  console.log(symptomPresent ? 'SYMPTOM_PRESENT' : 'SYMPTOM_ABSENT')
  exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM')
    await waitForExit(server)
  }
}

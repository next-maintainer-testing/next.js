import { appendFile, mkdir, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = process.cwd()
const nextBin = join(root, 'node_modules', '.bin', 'next')
const typescriptDir = dirname(require.resolve('typescript/package.json'))
const hiddenTypescriptDir = `${typescriptDir}.verify-hidden`
const fakeBinDir = join(root, '.verify-bin')
const installMarker = join(root, '.verify-install-attempted')

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
      process.stderr.write(chunk)
    })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, output }))
  })
}

async function unusedPort() {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

async function stopProcessGroup(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  const closed = new Promise((resolve) => child.once('close', resolve))
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
  ])
  if (!stopped) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
    await Promise.race([
      closed,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ])
  }
}

let server
let typescriptHidden = false
let result = 2
let observation = 'verification did not complete'

try {
  await rm(join(root, '.next'), { recursive: true, force: true })
  await rm(hiddenTypescriptDir, { recursive: true, force: true })
  await rm(fakeBinDir, { recursive: true, force: true })
  await rm(installMarker, { force: true })

  const build = await run(nextBin, ['build'])
  if (build.code !== 0) {
    throw new Error(`next build failed with ${build.code ?? build.signal}`)
  }

  await rename(typescriptDir, hiddenTypescriptDir)
  typescriptHidden = true

  await mkdir(fakeBinDir, { recursive: true })
  const fakeNpm = join(fakeBinDir, 'npm')
  await appendFile(
    fakeNpm,
    `#!/usr/bin/env node\nconst fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(installMarker)}, process.argv.slice(2).join(' '));\nsetInterval(() => {}, 1000);\n`,
    { mode: 0o755 },
  )

  const port = await unusedPort()
  const env = {
    ...process.env,
    PATH: `${fakeBinDir}:${process.env.PATH}`,
    NODE_ENV: 'production',
  }

  server = spawn(nextBin, ['start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let serverOutput = ''
  let serverClosed = false
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk
    process.stdout.write(chunk)
  })
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk
    process.stderr.write(chunk)
  })
  server.once('close', () => {
    serverClosed = true
  })

  const deadline = Date.now() + 10000
  let ready = false
  while (Date.now() < deadline && !serverClosed) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(500),
      })
      if (response.ok && (await response.text()).includes('Azure SWA warm-up reproduction')) {
        ready = true
        break
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  const installAttempted = existsSync(installMarker)
  if (ready) {
    result = 1
    observation = 'production warm-up reached HTTP readiness without TypeScript installed'
  } else if (installAttempted && !serverClosed) {
    result = 0
    observation = 'production warm-up hung while trying to install TypeScript to load next.config.ts'
  } else if (serverClosed) {
    observation = `next start exited before readiness: ${serverOutput.slice(-1000)}`
  } else {
    observation = `next start timed out without an observed TypeScript installation attempt: ${serverOutput.slice(-1000)}`
  }
} catch (error) {
  observation = error instanceof Error ? error.stack || error.message : String(error)
  result = 2
} finally {
  console.log(`\nVERIFY_RESULT: ${observation}`)
  process.exitCode = result
  await stopProcessGroup(server)
  if (typescriptHidden) {
    await rm(typescriptDir, { recursive: true, force: true })
    await rename(hiddenTypescriptDir, typescriptDir)
  }
  await rm(fakeBinDir, { recursive: true, force: true })
  await rm(installMarker, { force: true })
}

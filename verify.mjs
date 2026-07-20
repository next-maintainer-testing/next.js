import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cwd = new URL('.', import.meta.url).pathname
const nextBin = require.resolve('next/dist/bin/next')
const port = 32000 + (process.pid % 1000)
let server = null
let serverError = null
let serverOutput = ''

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
      process.stderr.write(chunk)
    })
    child.on('error', (error) => resolve({ code: null, error, output }))
    child.on('close', (code, signal) => resolve({ code, signal, output }))
  })
}

async function waitForServer(child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (serverError) throw serverError
    if (child.exitCode !== null) {
      throw new Error(`next start exited early with code ${child.exitCode}\n${serverOutput}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/foo`)
      if (response.status === 200) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`next start did not become ready\n${serverOutput}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }, 5_000)
    server.once('close', finish)
  })
}

async function main() {
  try {
    await rm(new URL('.next', import.meta.url), { recursive: true, force: true })
    const build = await run(process.execPath, [nextBin, 'build'])
    if (build.code !== 0) {
      console.error(`CHECK_FAILED: next build failed (code ${build.code}, signal ${build.signal ?? 'none'})`)
      process.exitCode = 2
      return
    }

    server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.on('error', (error) => {
      serverError = error
    })
    server.stdout.on('data', (chunk) => {
      serverOutput += chunk
      process.stdout.write(chunk)
    })
    server.stderr.on('data', (chunk) => {
      serverOutput += chunk
      process.stderr.write(chunk)
    })

    await waitForServer(server)
    const response = await fetch(`http://127.0.0.1:${port}/bar`, { redirect: 'manual' })
    const body = await response.text()
    const renderedBar = response.status === 200 && body.includes('data-testid="slug-page"') && body.includes('slug:') && body.includes('bar')

    console.log(`OBSERVED: GET /bar returned HTTP ${response.status}; rendered dynamic slug page: ${renderedBar}`)
    process.exitCode = renderedBar ? 0 : 1
  } catch (error) {
    console.error('CHECK_FAILED:', error instanceof Error ? error.stack : error)
    process.exitCode = 2
  } finally {
    await stopServer()
  }
}

await main()

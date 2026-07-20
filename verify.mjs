import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

const root = process.cwd()
const port = 42069
const nextBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next')
let server = null
let result = 2

function childEnvironment(extra = {}) {
  const legacy = '--openssl-legacy-provider'
  const current = process.env.NODE_OPTIONS || ''
  return {
    ...process.env,
    NODE_OPTIONS: current.includes(legacy) ? current : `${current} ${legacy}`.trim(),
    ...extra,
  }
}

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: childEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const append = (chunk) => {
      output = (output + chunk.toString()).slice(-20000)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`${command} failed (${code ?? signal})\n${output}`))
    })
  })
}

function request(hostname, pathname = '/shared') {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      headers: { Host: hostname },
      timeout: 5000,
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('timeout', () => req.destroy(new Error('request timed out')))
    req.on('error', reject)
  })
}

async function waitUntilReady() {
  const deadline = Date.now() + 30000
  let lastError
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited with ${server.exitCode}`)
    try {
      const response = await request('warmup.test', '/_next/static/missing')
      if (response.status) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw lastError || new Error('server did not become ready')
}

async function filesBelow(directory) {
  if (!existsSync(directory)) return []
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(full) : [path.relative(root, full)]
  }))
  return nested.flat().sort()
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  const closed = new Promise((resolve) => server.once('close', resolve))
  server.kill('SIGTERM')
  const timer = setTimeout(() => {
    if (server.exitCode === null) server.kill('SIGKILL')
  }, 5000)
  await closed
  clearTimeout(timer)
}

try {
  await rm(path.join(root, '.next'), { recursive: true, force: true })
  await run(nextBin, ['build'], 180000)

  server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: childEnvironment({ NODE_ENV: 'production', PORT: String(port) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverOutput = ''
  server.stdout.on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-10000) })
  server.stderr.on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-10000) })
  await waitUntilReady()

  const alpha = await request('alpha.test')
  const beta = await request('beta.test')
  if (alpha.status !== 200 || beta.status !== 200) {
    throw new Error(`unexpected statuses alpha=${alpha.status} beta=${beta.status}\n${serverOutput}`)
  }
  if (!alpha.body.includes('alpha.test')) {
    throw new Error(`first render did not receive alpha.test params\n${alpha.body.slice(0, 1000)}`)
  }

  const generated = await filesBelow(path.join(root, '.next', 'server'))
  const alphaHtml = path.join(root, '.next', 'server', 'pages', 'test_app', 'alpha.test', 'shared.html')
  const betaHtml = path.join(root, '.next', 'server', 'pages', 'test_app', 'beta.test', 'shared.html')
  const wrongSharedHtml = path.join(root, '.next', 'server', 'pages', 'shared.html')
  const hostSpecificFilesPresent = existsSync(alphaHtml) && existsSync(betaHtml)
  const crossHostResponse = !beta.body.includes('beta.test') || beta.body.includes('alpha.test')
  const wrongSharedFilePresent = existsSync(wrongSharedHtml)

  console.log(JSON.stringify({
    alphaStatus: alpha.status,
    betaStatus: beta.status,
    betaContainsOwnHost: beta.body.includes('beta.test'),
    betaContainsAlphaHost: beta.body.includes('alpha.test'),
    hostSpecificFilesPresent,
    wrongSharedFilePresent,
    generatedFiles: generated.filter((file) => /shared|alpha|beta/.test(file)),
  }, null, 2))

  result = (crossHostResponse || wrongSharedFilePresent || !hostSpecificFilesPresent) ? 0 : 1
} catch (error) {
  console.error(error && error.stack ? error.stack : error)
  result = 2
} finally {
  process.exitCode = result
  await stopServer()
}

import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')
const port = 31000 + (process.pid % 10000)
let output = ''
let child

function record(chunk) {
  output = (output + chunk.toString()).slice(-12000)
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      headers: { Host: 'example.com' },
      timeout: 10000
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({
        status: res.statusCode,
        location: res.headers.location || null,
        body
      }))
    })
    req.on('timeout', () => req.destroy(new Error('request timeout')))
    req.on('error', reject)
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntilReady() {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})\n${output}`)
    }
    try {
      await request('/')
      return
    } catch {
      await delay(500)
    }
  }
  throw new Error(`Next.js did not become ready within 120 seconds\n${output}`)
}

async function waitForExit(ms) {
  if (child.exitCode !== null) return true
  let timer
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), ms)
  })
  const exited = new Promise((resolve) => child.once('exit', () => resolve(true)))
  const result = await Promise.race([exited, timedOut])
  clearTimeout(timer)
  return result
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  if (!(await waitForExit(10000))) {
    child.kill('SIGKILL')
    await waitForExit(10000)
  }
}

try {
  const existingNodeOptions = process.env.NODE_OPTIONS || ''
  const nodeOptions = `${existingNodeOptions} --openssl-legacy-provider`.trim()
  child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_OPTIONS: nodeOptions, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', record)
  child.stderr.on('data', record)
  await waitUntilReady()

  const result = await request('/pl/about')
  const symptomPresent = result.status === 200 && result.body.includes('about page marker')
  console.log(JSON.stringify({
    request: 'GET http://example.com/pl/about',
    status: result.status,
    location: result.location,
    renderedAboutPage: result.body.includes('about page marker'),
    symptomPresent
  }))

  if (symptomPresent) {
    process.exitCode = 0
  } else if (result.status === 404 || (result.status >= 300 && result.status < 400)) {
    process.exitCode = 1
  } else {
    console.error(`Unexpected response status ${result.status}\n${output}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  await stopChild()
}

import { spawn } from 'node:child_process'
import path from 'node:path'

const host = '127.0.0.1'
const port = 32000 + (process.pid % 10000)
const encoded = '%3F%2C%3D%2C%2F%2C%26%2C%D1%88%D0%B5%D0%BB%D0%BB%D1%8B'
const decoded = '?,=,/,&,шеллы'
const baseUrl = `http://${host}:${port}`
let output = ''
let child
let result = 2

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function appendOutput(chunk) {
  output = (output + chunk.toString()).slice(-12000)
}

async function request(pathname, timeoutMs = 5000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(`${baseUrl}${pathname}`, {
      redirect: 'manual',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

async function waitForServer() {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await request(`/dynamic-route/${encoded}`, 1500)
      if (response.status === 200) return
    } catch {}
    await sleep(300)
  }
  throw new Error('Timed out waiting for Next.js to become ready')
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(5000),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
  child = spawn(process.execPath, [nextBin, 'dev', '--hostname', host, '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', appendOutput)
  child.stderr.on('data', appendOutput)

  await waitForServer()

  const pageResponse = await request(`/dynamic-page/${encoded}`)
  const routeResponse = await request(`/dynamic-route/${encoded}`)
  if (pageResponse.status !== 200 || routeResponse.status !== 200) {
    throw new Error(`Unexpected status: page=${pageResponse.status}, route=${routeResponse.status}`)
  }

  const pageHtml = await pageResponse.text()
  const routeBody = await routeResponse.json()
  const pageMatch = pageHtml.match(/data-path-param="([^"]*)"/)
  if (!pageMatch || typeof routeBody.pathParam !== 'string') {
    throw new Error('Could not read dynamic parameters from both responses')
  }

  const pageParam = decodeHtmlAttribute(pageMatch[1])
  const routeParam = routeBody.pathParam
  console.log(JSON.stringify({ pageParam, routeParam }))

  if (pageParam === encoded && routeParam === decoded) {
    console.log('Reported symptom present: page param is encoded while route param is decoded')
    result = 0
  } else if (pageParam === routeParam) {
    console.log('Reported symptom absent: page and route params are consistent')
    result = 1
  } else {
    throw new Error(`Unexpected parameter values: page=${JSON.stringify(pageParam)}, route=${JSON.stringify(routeParam)}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  if (output) console.error(`Next.js output:\n${output}`)
  result = 2
} finally {
  process.exitCode = result
  await stopServer()
}

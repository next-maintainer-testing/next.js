import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const cssPath = path.join(root, 'app', 'globals.css')
const initialCss = `@import "tailwindcss";

.hero {
  border-radius: 28px;
  background: #f3f4f6;
  padding: 24px;
  width: 320px;
  height: 160px;
  margin: 40px;
}
`
const radiusPattern = /(\.hero\s*\{[^}]*?border-radius:\s*)(\d+px)/s
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function setRadius(css, value) {
  if (!radiusPattern.test(css)) throw new Error('the .hero border-radius rule is missing')
  return css.replace(radiusPattern, `$1${value}`)
}

async function atomicWriteCss(css) {
  const temporary = `${cssPath}.tmp`
  await writeFile(temporary, css)
  await rename(temporary, cssPath)
}

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function fetchText(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response.text()
}

async function waitForServer(url, child, logs) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited with code ${child.exitCode}: ${logs.text()}`)
    }
    try {
      return await fetchText(url)
    } catch {}
    await sleep(250)
  }
  throw new Error(`next dev did not become ready: ${logs.text()}`)
}

function discoverCssUrls(html, baseUrl) {
  const urls = []
  const hrefPattern = /href="([^"]+\.css[^"]*)"/g
  for (const match of html.matchAll(hrefPattern)) {
    urls.push(new URL(match[1].replaceAll('&amp;', '&'), baseUrl).href)
  }
  return urls
}

async function servedRadius(cssUrls) {
  for (const url of cssUrls) {
    try {
      const css = await fetchText(url)
      const match = css.match(radiusPattern)
      if (match) return match[2]
    } catch {}
  }
  return null
}

async function waitForRadius(cssUrls, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    const observed = await servedRadius(cssUrls)
    if (observed !== null) last = observed
    if (observed === expected) return { matched: true, observed }
    await sleep(100)
  }
  return { matched: false, observed: last }
}

async function waitForEitherRadius(cssUrls, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    const observed = await servedRadius(cssUrls)
    if (observed !== null) last = observed
    if (expected.includes(observed)) return observed
    await sleep(100)
  }
  return last
}

function boundedLogs() {
  let value = ''
  return {
    add(chunk) {
      value = (value + chunk.toString()).slice(-12_000)
    },
    text() {
      return value
    },
  }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  await Promise.race([exited, sleep(5_000)])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

let child = null
let finalCode = 2
let summary = 'check did not complete'
const logs = boundedLogs()

try {
  await writeFile(cssPath, initialCss)
  await rm(path.join(root, '.next'), { recursive: true, force: true })

  const port = await freePort()
  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
  child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => logs.add(chunk))
  child.stderr.on('data', (chunk) => logs.add(chunk))

  const baseUrl = `http://127.0.0.1:${port}/`
  const html = await waitForServer(baseUrl, child, logs)
  const cssUrls = discoverCssUrls(html, baseUrl)
  if (cssUrls.length === 0) throw new Error('the rendered page exposed no CSS chunk')

  let current = await servedRadius(cssUrls)
  if (current !== '28px') throw new Error(`initial served radius was ${current ?? 'missing'}, expected 28px`)

  let foundStaleSave = false
  for (let iteration = 1; iteration <= 8; iteration += 1) {
    const target = current === '28px' ? '29px' : '28px'
    await atomicWriteCss(setRadius(initialCss, target))
    const result = await waitForRadius(cssUrls, target, 4_000)
    if (result.matched) {
      current = target
      continue
    }

    if (result.observed !== current) {
      throw new Error(`unexpected served radius after save: ${result.observed ?? 'missing'}`)
    }

    const followUp = target === '29px' ? '30px' : '31px'
    await atomicWriteCss(setRadius(initialCss, followUp))
    const afterFollowUp = await waitForEitherRadius(cssUrls, [target, followUp], 6_000)
    if (afterFollowUp === target) {
      finalCode = 0
      summary = `symptom present: save ${iteration} stayed at ${current}; the follow-up save served the prior ${target}`
      foundStaleSave = true
      break
    }
    if (afterFollowUp === followUp) {
      finalCode = 0
      summary = `symptom present: save ${iteration} stayed at ${current}; a follow-up save resumed CSS updates at ${followUp}`
      foundStaleSave = true
      break
    }
    if (afterFollowUp === current) {
      finalCode = 0
      summary = `symptom present: globals.css saves remained stale at ${current}, including after a follow-up save`
      foundStaleSave = true
      break
    }
    throw new Error(`the served CSS rule disappeared after a follow-up save`)
  }

  if (!foundStaleSave) {
    finalCode = 1
    summary = 'symptom absent: all 8 globals.css saves were reflected by the served CSS chunk'
  }
} catch (error) {
  finalCode = 2
  summary = `check failure: ${error instanceof Error ? error.message : String(error)}`
}

process.exitCode = finalCode
await writeFile(cssPath, initialCss).catch(() => {})
await rm(`${cssPath}.tmp`, { force: true }).catch(() => {})
await stopChild(child).catch(() => {})
console.log(summary)
if (finalCode === 2 && logs.text()) console.error(logs.text())

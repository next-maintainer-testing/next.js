import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import net from 'node:net'

const cwd = new URL('.', import.meta.url).pathname
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
let server = null
let exitCode = 2

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address()
      socket.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForPage(url, child) {
  let lastError
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js server exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return await response.text()
      lastError = new Error(`Page returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError ?? new Error('Timed out waiting for the page')
}

function extractTargetClass(html) {
  const tag = html.match(/<[^>]*\bid=["']dynamic-css-target["'][^>]*>/)?.[0]
  if (!tag) throw new Error('Rendered target element was not found')
  const classes = tag.match(/\bclass=["']([^"']+)["']/)?.[1]?.split(/\s+/).filter(Boolean)
  if (!classes?.length) throw new Error('Rendered target has no CSS Module class')
  return classes[0]
}

function stylesheetUrls(html, baseUrl) {
  const urls = []
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel=["']stylesheet["']/i.test(tag[0])) continue
    const href = tag[0].match(/\bhref=["']([^"']+)["']/i)?.[1]
    if (href) urls.push(new URL(href.replaceAll('&amp;', '&'), baseUrl))
  }
  return urls
}

try {
  await rm(new URL('./.next', import.meta.url), { recursive: true, force: true })
  const build = await run(process.execPath, [nextBin, 'build'])
  if (build.code !== 0) throw new Error(`next build failed (${build.code ?? build.signal})`)

  const port = await reservePort()
  server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env,
    stdio: 'inherit',
    detached: process.platform !== 'win32'
  })
  const serverExit = new Promise((resolve) => server.once('exit', resolve))
  server.completed = serverExit
  server.once('error', (error) => console.error(error))

  const pageUrl = `http://127.0.0.1:${port}/test`
  const html = await waitForPage(pageUrl, server)
  const targetClass = extractTargetClass(html)
  const cssUrls = stylesheetUrls(html, pageUrl)
  const cssTexts = []
  for (const url of cssUrls) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Stylesheet ${url} returned HTTP ${response.status}`)
    cssTexts.push(await response.text())
  }

  const escapedClass = targetClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const selector = new RegExp(`\\.${escapedClass}(?![A-Za-z0-9_-])`)
  const inlineStyles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1])
  const styleDelivered = [...cssTexts, ...inlineStyles].some((css) => selector.test(css))

  if (styleDelivered) {
    console.log(`ABSENT: CSS for ${targetClass} was delivered by the initial page (${cssUrls.length} linked stylesheet(s))`)
    exitCode = 1
  } else {
    console.log(`PRESENT: ${targetClass} rendered, but its CSS was absent from the initial page (${cssUrls.length} linked stylesheet(s))`)
    exitCode = 0
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack ?? error}`)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (server && server.exitCode === null) {
    if (process.platform === 'win32') server.kill('SIGTERM')
    else {
      try { process.kill(-server.pid, 'SIGTERM') } catch {}
    }
    await Promise.race([
      server.completed,
      new Promise((resolve) => setTimeout(resolve, 5000))
    ])
    if (server.exitCode === null) {
      if (process.platform === 'win32') server.kill('SIGKILL')
      else {
        try { process.kill(-server.pid, 'SIGKILL') } catch {}
      }
      await server.completed
    }
  }
}

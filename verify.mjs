import { rm } from 'node:fs/promises'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { JSDOM, VirtualConsole } from 'jsdom'

const cwd = new URL('.', import.meta.url).pathname
let server = null
let dom = null
process.exitCode = 2

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
}

function getPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function fetchPage(url) {
  const deadline = Date.now() + 60_000
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'text/html' },
        redirect: 'manual'
      })
      return { status: response.status, html: await response.text() }
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`server did not become reachable: ${lastError}`)
}

async function renderedBoundary(url, html) {
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error) => {
    console.error('jsdom:', error.message)
  })
  dom = new JSDOM(html, {
    url,
    resources: 'usable',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      for (const name of [
        'TextEncoder', 'TextDecoder', 'ReadableStream', 'TransformStream',
        'Headers', 'Request', 'Response'
      ]) {
        if (globalThis[name] && !window[name]) window[name] = globalThis[name]
      }
      if (!window.fetch) window.fetch = globalThis.fetch.bind(globalThis)
    }
  })

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const renderedText = [...dom.window.document.querySelectorAll('main')]
      .map((element) => element.textContent || '')
      .join('\n')
    const rootRendered = renderedText.includes('ROOT_NOT_FOUND_52329')
    const localeRendered = renderedText.includes('LOCALE_NOT_FOUND_52329')
    if (rootRendered !== localeRendered) return { rootRendered, localeRendered }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return { rootRendered: false, localeRendered: false }
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  const closed = new Promise((resolve) => child.once('close', resolve))
  child.kill('SIGTERM')
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000))
  ])
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL')
    await closed
  }
}

try {
  await rm(new URL('.next', import.meta.url), { recursive: true, force: true })
  const build = await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'])
  if (build.code !== 0) {
    throw new Error(`next build failed (code=${build.code}, signal=${build.signal})`)
  }

  const port = await getPort()
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    { cwd, stdio: 'inherit' }
  )
  server.once('error', (error) => console.error('next start error:', error))

  const url = `http://127.0.0.1:${port}/en`
  const { status, html } = await fetchPage(url)
  const { rootRendered, localeRendered } = await renderedBoundary(url, html)

  console.log(JSON.stringify({ status, rootRendered, localeRendered }))
  if (rootRendered && !localeRendered) {
    process.exitCode = 0
  } else if (localeRendered && !rootRendered) {
    process.exitCode = 1
  } else {
    console.error('Could not uniquely identify the rendered not-found boundary')
    process.exitCode = 2
  }
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  dom?.window.close()
  await stopServer(server)
}

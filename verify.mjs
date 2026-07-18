import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'

const cwd = new URL('.', import.meta.url).pathname
const nextBin = resolve(cwd, 'node_modules/.bin/next')
const port = 35425
let server = null
let exitCode = 2

function run(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: 'inherit' })
    child.on('error', (error) => {
      console.error(`Could not launch ${command}:`, error)
      resolveRun(2)
    })
    child.on('exit', (code, signal) => {
      if (signal) {
        console.error(`${command} exited from signal ${signal}`)
        resolveRun(2)
      } else {
        resolveRun(code ?? 2)
      }
    })
  })
}

async function getHtml() {
  const deadline = Date.now() + 30_000
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/?value=from-query`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      await new Promise((resolveWait) => setTimeout(resolveWait, 250))
    }
  }
  throw lastError ?? new Error('Timed out waiting for the production server')
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    once(server, 'exit'),
    new Promise((resolveWait) => setTimeout(resolveWait, 10_000)),
  ])
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL')
    await once(server, 'exit')
  }
}

try {
  const buildCode = await run(nextBin, ['build'])
  if (buildCode !== 0) throw new Error(`next build failed with exit code ${buildCode}`)

  server = spawn(nextBin, ['start', '-p', String(port)], {
    cwd,
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit',
  })
  server.on('error', (error) => console.error('Could not launch next start:', error))

  const html = await getHtml()
  const hasServerShell = /<h1[^>]*id=["']server-shell["'][^>]*>Server-rendered shell<\/h1>/.test(html)
  const hasFallback = /<p[^>]*id=["']search-fallback["'][^>]*>Loading search value<\/p>/.test(html)
  const hasRenderedSearchValue = /<p[^>]*id=["']search-value["'][^>]*>Search value: (?:<!-- -->)?from-query<\/p>/.test(html)

  console.log(JSON.stringify({ hasServerShell, hasFallback, hasRenderedSearchValue }))

  if (!hasServerShell || (!hasFallback && !hasRenderedSearchValue)) {
    console.error('The production response did not contain the expected page shell or Suspense content.')
    exitCode = 2
  } else if (hasRenderedSearchValue) {
    console.log('The useSearchParams client component was pre-rendered in the server HTML; symptom absent.')
    exitCode = 1
  } else {
    console.log('The useSearchParams client component was missing from the server HTML; symptom present.')
    exitCode = 0
  }
} catch (error) {
  console.error(error)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  await stopServer()
}

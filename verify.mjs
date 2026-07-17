import { spawn } from 'node:child_process'
import net from 'node:net'

const cwd = new URL('.', import.meta.url).pathname
let child
let exitCode = 2
let details = ''

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

async function fetchWithRetry(url) {
  let lastError
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { host: 'default.example' },
        redirect: 'manual',
      })
      if (response.status === 200) return await response.text()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError ?? new Error('server did not become ready')
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`))
  return match?.[1]
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    child.once('exit', finish)
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
      child.once('exit', finish)
    }, 5000)
  })
}

try {
  const port = await allocatePort()
  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let logs = ''
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })

  const html = await fetchWithRetry(`http://127.0.0.1:${port}/fr`)
  const marker = html.match(/<div id="locale-result"[^>]*><\/div>/)?.[0]
  if (!marker) throw new Error(`locale result marker missing; server logs: ${logs.slice(-2000)}`)

  const observed = {
    contextLocale: readAttribute(marker, 'data-context-locale'),
    contextDefaultLocale: readAttribute(marker, 'data-context-default-locale'),
    routerLocale: readAttribute(marker, 'data-router-locale'),
    routerDefaultLocale: readAttribute(marker, 'data-router-default-locale'),
  }

  if (observed.contextLocale !== 'fr' || observed.routerLocale !== 'fr') {
    throw new Error(`request did not resolve the requested locale: ${JSON.stringify(observed)}`)
  }

  const symptomPresent = observed.contextDefaultLocale === 'fr' && observed.routerDefaultLocale === 'fr'
  const symptomAbsent = observed.contextDefaultLocale === 'de' && observed.routerDefaultLocale === 'de'
  if (!symptomPresent && !symptomAbsent) {
    throw new Error(`unexpected mixed locale state: ${JSON.stringify(observed)}`)
  }

  exitCode = symptomPresent ? 0 : 1
  details = `${symptomPresent ? 'BUG PRESENT' : 'BUG ABSENT'} ${JSON.stringify(observed)}`
} catch (error) {
  exitCode = 2
  details = `CHECK FAILED ${error?.stack ?? error}`
}

process.exitCode = exitCode
await stopChild()
console.log(details)

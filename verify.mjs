import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { readFile, rm } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const cwd = new URL('.', import.meta.url).pathname

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...options.env },
      stdio: options.stdio || 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

async function getPort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function fetchUntilReady(url, deadline) {
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.status === 200) return response
      lastError = new Error(`readiness returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw lastError || new Error('Next.js server did not become ready')
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

async function verify() {
  await rm(new URL('.next', import.meta.url), { recursive: true, force: true })
  const nextBin = require.resolve('next/dist/bin/next')
  const build = await run(process.execPath, [nextBin, 'build'])
  if (build.code !== 0) throw new Error(`next build failed with ${build.signal || build.code}`)

  const buildId = (await readFile(new URL('.next/BUILD_ID', import.meta.url), 'utf8')).trim()
  if (!buildId) throw new Error('Next.js did not emit a build ID')

  const port = await getPort()
  const child = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })

  try {
    const pagePath = '/local/path/to/example'
    await fetchUntilReady(`http://127.0.0.1:${port}${pagePath}`, Date.now() + 30000)

    const query = '?slug=local&slug=path&slug=to&slug=example'
    const dataUrl = `http://127.0.0.1:${port}/_next/data/${buildId}${pagePath}.json${query}`
    const baseline = await fetch(dataUrl)
    const baselineType = baseline.headers.get('content-type') || ''
    const baselineBody = await baseline.text()
    if (baseline.status !== 200 || !baselineType.includes('application/json') || !baselineBody.includes('"example"')) {
      throw new Error(`baseline data request failed: HTTP ${baseline.status}, type ${baselineType}, body ${baselineBody.slice(0, 200)}`)
    }

    const prefetched = await fetch(dataUrl, {
      headers: {
        purpose: 'prefetch',
        'x-now-route-matches': 'nxtPslug=local%2Fpath%2Fto%2Fexample',
      },
    })
    const type = prefetched.headers.get('content-type') || ''
    const body = await prefetched.text()
    console.log(JSON.stringify({
      next: require('next/package.json').version,
      baseline: { status: baseline.status, contentType: baselineType },
      proxiedPrefetch: { status: prefetched.status, contentType: type, bodyPrefix: body.slice(0, 80) },
    }))

    if (prefetched.status === 404) return 0
    if (prefetched.status === 200 && type.includes('application/json') && body.includes('"example"')) return 1
    throw new Error(`unexpected prefetch result: HTTP ${prefetched.status}, type ${type}, body ${body.slice(0, 200)}`)
  } finally {
    await stop(child)
    if (child.exitCode && child.exitCode !== 0 && output) process.stderr.write(output)
  }
}

let code = 2
try {
  code = await verify()
} catch (error) {
  console.error(error && error.stack ? error.stack : error)
}
process.exitCode = code

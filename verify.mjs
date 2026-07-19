import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'

const root = dirname(fileURLToPath(import.meta.url))
const appDir = join(root, '.git-projects', 'app')
const pageFile = join(appDir, 'app', 'page.js')
const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')
const nextPackage = JSON.parse(await readFile(require.resolve('next/package.json'), 'utf8'))
const nextMajor = Number.parseInt(nextPackage.version.split('.')[0], 10)
const initialMarker = `ISSUE_75372_INITIAL_${Date.now()}`
const changedMarker = `ISSUE_75372_CHANGED_${Date.now()}`
const initialSource = `export default function Page() {\n  return <main id="marker">${initialMarker}</main>\n}\n`
const changedSource = `export default function Page() {\n  return <main id="marker">${changedMarker}</main>\n}\n`

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

let child
let childExit
let output = ''
let observation = 'check did not complete'
let result = 2

try {
  await writeFile(pageFile, initialSource)
  const port = await freePort()
  const args = [nextBin, 'dev']
  if (nextMajor >= 16) args.push('--webpack')
  args.push('-H', '127.0.0.1', '-p', String(port))

  child = spawn(process.execPath, args, {
    cwd: appDir,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  childExit = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  const capture = (chunk) => {
    output += chunk.toString()
    if (output.length > 12000) output = output.slice(-12000)
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)

  const url = `http://127.0.0.1:${port}/`
  const request = async () => {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  }

  const readyDeadline = Date.now() + 90000
  let initialSeen = false
  while (Date.now() < readyDeadline) {
    if (child.exitCode !== null) throw new Error(`dev server exited early with ${child.exitCode}`)
    try {
      const html = await request()
      if (html.includes(initialMarker)) {
        initialSeen = true
        break
      }
    } catch {}
    await delay(500)
  }
  if (!initialSeen) throw new Error('initial marker was not served before the readiness deadline')

  await delay(1500)
  await writeFile(pageFile, changedSource)

  const updateDeadline = Date.now() + 20000
  let changedSeen = false
  let successfulResponses = 0
  while (Date.now() < updateDeadline) {
    if (child.exitCode !== null) throw new Error(`dev server exited after edit with ${child.exitCode}`)
    try {
      const html = await request()
      successfulResponses += 1
      if (html.includes(changedMarker)) {
        changedSeen = true
        break
      }
    } catch {}
    await delay(500)
  }
  if (successfulResponses === 0) throw new Error('no successful response was received after the edit')

  if (changedSeen) {
    observation = `Webpack dev server on Next.js ${nextPackage.version} served the changed marker; hot reload works.`
    result = 1
  } else {
    observation = `Webpack dev server on Next.js ${nextPackage.version} kept serving stale output for 20 seconds after the source edit under .git-projects; symptom reproduced.`
    result = 0
  }
} catch (error) {
  observation = `Verification failed: ${error instanceof Error ? error.message : String(error)}`
  result = 2
} finally {
  process.exitCode = result
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    const stopped = await Promise.race([childExit.then(() => true), delay(5000).then(() => false)])
    if (!stopped && child.exitCode === null) {
      child.kill('SIGKILL')
      await Promise.race([childExit, delay(2000)])
    }
  }
  console.log(observation)
  if (result === 2 && output) console.error(output)
}

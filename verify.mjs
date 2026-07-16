import { spawn } from 'node:child_process'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const nextBin = path.join(root, 'node_modules', '.bin', 'next')
const port = 31000 + (process.pid % 2000)
const baseUrl = `http://127.0.0.1:${port}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function spawnNext(args) {
  return spawn(nextBin, args, {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function waitForChild(child, timeoutMs, label) {
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
    process.stdout.write(chunk)
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
    process.stderr.write(chunk)
  })

  let timer
  const result = await Promise.race([
    new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal }))),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ timeout: true }), timeoutMs)
    }),
  ])
  clearTimeout(timer)

  if (result.timeout) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('close', resolve))
    throw new Error(`${label} timed out`)
  }
  if (result.code !== 0) {
    throw new Error(`${label} failed with code ${result.code} and signal ${result.signal ?? 'none'}\n${output.slice(-4000)}`)
  }
}

async function request(pathname, options) {
  return fetch(`${baseUrl}${pathname}`, {
    redirect: 'manual',
    ...options,
  })
}

async function waitForServer() {
  const deadline = Date.now() + 60_000
  let lastError
  while (Date.now() < deadline) {
    try {
      return await request('/')
    } catch (error) {
      lastError = error
      await sleep(250)
    }
  }
  throw new Error(`server did not become ready: ${lastError?.message ?? 'no response'}`)
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const closed = new Promise((resolve) => child.once('close', resolve))
  const timedOut = await Promise.race([
    closed.then(() => false),
    sleep(5_000).then(() => true),
  ])
  if (timedOut && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('close', resolve))
  }
}

async function run() {
  let server = null
  let resultCode = 2

  try {
    await rm(path.join(root, '.next'), { recursive: true, force: true })
    await writeFile(path.join(root, 'data', 'published.txt'), 'missing\n')

    const build = spawnNext(['build'])
    await waitForChild(build, 180_000, 'next build')

    server = spawnNext(['start', '-p', String(port), '-H', '127.0.0.1'])
    server.stdout.on('data', (chunk) => process.stdout.write(chunk))
    server.stderr.on('data', (chunk) => process.stderr.write(chunk))

    const initial = await waitForServer()
    const initialBody = await initial.text()
    if (initial.status !== 404) {
      throw new Error(`expected initial page status 404, received ${initial.status}: ${initialBody.slice(0, 500)}`)
    }
    console.log('Observed initial cached 404 response.')

    const publish = await request('/api/publish', { method: 'POST' })
    const publishBody = await publish.text()
    if (publish.status !== 200 || !publishBody.includes('issue-72546-page')) {
      throw new Error(`publish/revalidate request failed with ${publish.status}: ${publishBody.slice(0, 500)}`)
    }
    console.log('Backing data was published and revalidateTag completed.')

    let regenerated = false
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const response = await request('/')
      const body = await response.text()
      console.log(`Post-invalidation request ${attempt}: HTTP ${response.status}`)
      if (response.status === 200 && body.includes('EXPECTED_PAGE_AFTER_TAG_REVALIDATION')) {
        regenerated = true
        break
      }
      if (response.status !== 404) {
        throw new Error(`unexpected post-invalidation response ${response.status}: ${body.slice(0, 500)}`)
      }
      await sleep(500)
    }

    if (regenerated) {
      console.log('Symptom absent: the tagged 404 regenerated to the expected 200 page.')
      resultCode = 1
    } else {
      console.log('Symptom present: the tagged page remained a cached 404 after revalidateTag.')
      resultCode = 0
    }
  } catch (error) {
    console.error(error?.stack ?? error)
    resultCode = 2
  } finally {
    process.exitCode = resultCode
    if (server) {
      await stopServer(server)
    }
  }
}

run().catch((error) => {
  console.error(error?.stack ?? error)
  process.exitCode = 2
})

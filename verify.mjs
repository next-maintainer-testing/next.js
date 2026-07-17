import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'

const marker = 'Issue 78070 page response'
let child
let outcome = 2

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => {
        if (error) reject(error)
        else if (port === null) reject(new Error('Could not reserve a port'))
        else resolve(port)
      })
    })
  })
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`Readiness GET returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError?.message ?? 'unknown error'}`)
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  const port = await reservePort()
  const url = `http://127.0.0.1:${port}/`
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
  child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => process.stdout.write(chunk))
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))

  const getResponse = await waitForServer(url, 90000)
  const getBody = await getResponse.text()
  if (!getBody.includes(marker)) {
    throw new Error('GET response did not contain the page marker')
  }

  const postResponse = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ issue: 78070 }),
  })
  const postBody = await postResponse.text()

  const symptomPresent = postResponse.status === 200 && postBody.includes(marker)
  console.log(JSON.stringify({
    getStatus: getResponse.status,
    postStatus: postResponse.status,
    postContainsPageMarker: postBody.includes(marker),
    symptomPresent,
  }))
  outcome = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  outcome = 2
} finally {
  process.exitCode = outcome
  await stopChild()
}

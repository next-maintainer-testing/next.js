import { spawn } from 'node:child_process'
import net from 'node:net'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  const exited = new Promise((resolve) => child.once('exit', resolve))
  await Promise.race([exited, sleep(5000)])
  if (child.exitCode === null && child.signalCode === null) {
    try { process.kill(-child.pid, 'SIGKILL') } catch {}
    await Promise.race([exited, sleep(2000)])
  }
}

let child
let result = 2
try {
  const port = await freePort()
  let output = ''
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  const deadline = Date.now() + 90000
  let response
  let body = ''
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) break
    try {
      response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(10000) })
      body = await response.text()
      break
    } catch (error) {
      lastError = error
      await sleep(500)
    }
  }
  await sleep(1500)
  const observed = `${output}\n${body}`
  const hasAsset = observed.includes('~@/public/asset.svg')
  const hasResolutionError = /Module not found|Can(?:not|'t) resolve/i.test(observed)

  if (hasAsset && hasResolutionError) {
    console.log('REPRODUCED: Turbopack dev cannot resolve the existing CSS asset URL ~@/public/asset.svg.')
    result = 0
  } else if (response?.ok) {
    console.log(`NOT REPRODUCED: page compiled successfully (HTTP ${response.status}).`)
    result = 1
  } else {
    console.error(`CHECK FAILED: no conclusive page response or matching resolution diagnostic.${lastError ? ` Last fetch error: ${lastError.message}` : ''}`)
    console.error(output.slice(-4000))
    result = 2
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error?.stack || error}`)
  result = 2
} finally {
  process.exitCode = result
  if (child) await stop(child)
}

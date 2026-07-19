import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import net from 'node:net'

const root = new URL('.', import.meta.url).pathname
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
let server
let logs = ''

function runNext(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`next ${args[0]} timed out\n${output.slice(-4000)}`))
    }, timeoutMs)
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`next ${args[0]} failed (${code ?? signal})\n${output.slice(-4000)}`))
    })
  })
}

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.on('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address()
      socket.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function pageValue(url, deadlineMs = 30000) {
  const deadline = Date.now() + deadlineMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      const values = [...new Set(html.match(/CACHE_VALUE_\d+/g) ?? [])]
      if (values.length !== 1) throw new Error(`expected one rendered cache value, received ${JSON.stringify(values)}`)
      return values[0]
    } catch (error) {
      lastError = error
      await sleep(250)
    }
  }
  throw new Error(`server did not return a valid page: ${lastError}`)
}

try {
  await rm(new URL('./.next', import.meta.url), { recursive: true, force: true })
  await runNext(['build'], 120000)

  const port = await freePort()
  server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => { logs += chunk })
  server.stderr.on('data', (chunk) => { logs += chunk })

  const url = `http://127.0.0.1:${port}/whatever`
  const initial = await pageValue(url)
  await sleep(3500)

  const afterExpiry = []
  for (let index = 0; index < 3; index++) {
    afterExpiry.push(await pageValue(url))
    if (index < 2) await sleep(1000)
  }

  const remainedOld = afterExpiry.every((value) => value === initial)
  process.exitCode = remainedOld ? 0 : 1
  console.log(JSON.stringify({
    symptom: remainedOld ? 'expired unstable_cache result remained in every refreshed page' : 'a refreshed page exposed revalidated data',
    initial,
    afterExpiry,
  }))
} catch (error) {
  process.exitCode = 2
  console.error(error instanceof Error ? error.stack : error)
  if (logs) console.error(logs.slice(-4000))
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      sleep(5000).then(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
      }),
    ])
  }
}

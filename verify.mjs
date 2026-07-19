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
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const deadline = sleep(5000).then(() => 'timeout')
  if (await Promise.race([exited, deadline]) === 'timeout' && child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

let child
let logs = ''
try {
  const port = await freePort()
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })

  let response
  let lastError
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before serving a response (${child.exitCode})`)
    try {
      response = await fetch(`http://127.0.0.1:${port}/en/fr`)
      break
    } catch (error) {
      lastError = error
      await sleep(500)
    }
  }
  if (!response) throw lastError || new Error('Next.js did not become ready')

  const body = await response.text()
  const wrongHome = response.status === 200 && body.includes('<html lang="fr"') && body.includes('<main>home</main>')
  const expected404 = response.status === 404 && body.includes('<html lang="en"') && body.includes('404 locale: unknown')

  if (wrongHome) {
    console.log('SYMPTOM_PRESENT: GET /en/fr incorrectly returned the home page with locale fr (HTTP 200).')
    process.exitCode = 0
  } else if (expected404) {
    console.log('SYMPTOM_ABSENT: GET /en/fr returned the expected en-locale 404 page.')
    process.exitCode = 1
  } else {
    console.error(`CHECK_FAILED: unexpected response status=${response.status} body=${body.slice(0, 500)}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack || error}`)
  console.error(logs.slice(-4000))
  process.exitCode = 2
} finally {
  if (child) await stop(child)
}

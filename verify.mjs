import { spawn } from 'node:child_process'
import net from 'node:net'

const root = new URL('.', import.meta.url).pathname
let child
let output = ''
let responseStatus = null
let responseBody = ''
let exitCode = 2

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

function waitForReady(timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const check = () => {
      if (/\bReady in\b/i.test(output)) return resolve()
      if (child?.exitCode !== null) return reject(new Error(`Next.js exited before becoming ready (${child.exitCode})`))
      if (Date.now() - started > timeoutMs) return reject(new Error('Timed out waiting for Next.js dev server'))
      setTimeout(check, 100)
    }
    check()
  })
}

function stopChild() {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve()
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

try {
  const port = await reservePort()
  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  await waitForReady(90000)
  const response = await fetch(`http://127.0.0.1:${port}/`)
  responseStatus = response.status
  responseBody = await response.text()
  await new Promise((resolve) => setTimeout(resolve, 500))

  const evidence = `${responseBody}\n${output}`
  const manifestFailure = /Could not find the module[\s\S]*React Client Manifest/i.test(evidence)
  const composedExportFailure = /Cannot access[^\n]*Header\.Root[^\n]*server/i.test(evidence)
  const rendered = response.ok && /<h1[^>]*>Hello<\/h1>/.test(responseBody)

  if (!response.ok && (manifestFailure || composedExportFailure)) {
    console.log(`REPRODUCED: GET / returned ${responseStatus} with the client composition failure.`)
    exitCode = 0
  } else if (rendered) {
    console.log(`NOT REPRODUCED: GET / returned ${responseStatus} and rendered Header.Root content.`)
    exitCode = 1
  } else {
    console.error(`CHECK FAILED: unexpected GET / result (status ${responseStatus}).`)
    console.error(evidence.slice(-4000))
    exitCode = 2
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack || error}`)
  console.error(output.slice(-4000))
  exitCode = 2
} finally {
  process.exitCode = exitCode
  await stopChild()
}

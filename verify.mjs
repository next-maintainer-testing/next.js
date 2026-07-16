import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const port = 3219
const child = spawn(process.execPath, [
  './node_modules/next/dist/bin/next',
  'dev',
  '--turbo',
  '-p',
  String(port),
], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', chunk => { output += chunk.toString() })
child.stderr.on('data', chunk => { output += chunk.toString() })

async function stopServer() {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(5000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
}

let result = 2
try {
  const deadline = Date.now() + 90000
  let status = 0
  let body = ''

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with code ${child.exitCode}`)
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(5000),
      })
      status = response.status
      body = await response.text()

      if (status === 200 && body.includes('OK: mp4 was excluded')) {
        result = 1
        break
      }

      if (
        status === 500 &&
        output.includes('content/post/ignored.mp4') &&
        output.includes('Unknown module type')
      ) {
        result = 0
        break
      }
    } catch {
      // The server may still be starting or compiling.
    }

    await delay(500)
  }

  if (result === 2) {
    console.error(`Could not classify response (last status ${status}).`)
    console.error(output.slice(-8000))
  } else if (result === 0) {
    console.log('Reproduced: Turbopack ignored webpackExclude and compiled ignored.mp4, causing HTTP 500.')
  } else {
    console.log('Not reproduced: webpackExclude omitted ignored.mp4 and the page returned HTTP 200.')
  }
} catch (error) {
  console.error(error)
  console.error(output.slice(-8000))
  result = 2
} finally {
  process.exitCode = result
  await stopServer()
}

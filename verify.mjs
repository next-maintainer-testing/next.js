import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const port = 3219
const marker = 'LOCALIZED_404_MARKER'

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`))
      else if (code !== 0) reject(new Error(`${command} exited with ${code}`))
      else resolve()
    })
  })
}

let server
try {
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })

  server = spawn(process.execPath, [
    'node_modules/next/dist/bin/next',
    'start',
    '-p',
    String(port),
  ], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  server.stdout.on('data', chunk => { output += chunk })
  server.stderr.on('data', chunk => { output += chunk })

  let response
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(`server exited early with ${server.exitCode}: ${output}`)
    try {
      response = await fetch(`http://127.0.0.1:${port}/test/zh/missing`)
      break
    } catch {
      await delay(250)
    }
  }
  if (!response) throw new Error(`server did not become ready: ${output}`)

  const body = await response.text()
  const localizedNotFoundRendered = body.includes(marker)
  console.log(JSON.stringify({
    url: '/test/zh/missing',
    status: response.status,
    localizedNotFoundRendered,
  }))

  if (response.status !== 404) {
    throw new Error(`expected HTTP 404, received ${response.status}`)
  }
  process.exitCode = localizedNotFoundRendered ? 1 : 0
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      new Promise(resolve => server.once('exit', resolve)),
      delay(5000).then(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
      }),
    ])
  }
}

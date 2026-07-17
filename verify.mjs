import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import { rmSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const appDir = path.join(root, 'apps', 'web')
const port = 31972
const symptom = /Cannot find module ['"]\.\.\/\.\.\/lib\/get-network-host['"]/

function printCaptured(label, value) {
  const text = String(value || '')
  if (text) process.stderr.write(`\n--- ${label} ---\n${text.slice(-12000)}\n`)
}

function probeServer() {
  return new Promise((resolve) => {
    const request = http.get(
      { hostname: '127.0.0.1', port, path: '/', timeout: 1000 },
      (response) => {
        response.resume()
        resolve(true)
      },
    )
    request.on('timeout', () => request.destroy())
    request.on('error', () => resolve(false))
  })
}

async function main() {
  rmSync(path.join(appDir, '.next'), { recursive: true, force: true })

  const build = spawnSync('pnpm', ['--dir', appDir, 'build'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    maxBuffer: 20 * 1024 * 1024,
    timeout: 240_000,
  })
  printCaptured('build stdout', build.stdout)
  printCaptured('build stderr', build.stderr)
  if (build.error || build.status !== 0) {
    process.stderr.write(`Build check failed: ${build.error?.message || `exit ${build.status}`}\n`)
    process.exitCode = 2
    return
  }

  const serverPath = path.join(appDir, '.next', 'standalone', 'server.js')
  const child = spawn(process.execPath, [serverPath], {
    cwd: appDir,
    env: {
      ...process.env,
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  const collect = (chunk) => {
    output = (output + chunk.toString()).slice(-20000)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  let poll
  let deadline
  const outcome = await new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      clearTimeout(deadline)
      resolve(value)
    }

    child.on('error', (error) => finish({ code: 2, reason: `Server launch check failed: ${error.message}` }))
    child.on('close', (code, signal) => {
      if (symptom.test(output)) {
        finish({ code: 0, reason: 'Standalone launch reproduced the missing ../../lib/get-network-host module error.' })
      } else {
        finish({ code: 2, reason: `Standalone server exited unexpectedly (code ${code}, signal ${signal}).` })
      }
    })

    poll = setInterval(async () => {
      if (symptom.test(output)) {
        finish({ code: 0, reason: 'Standalone launch reproduced the missing ../../lib/get-network-host module error.' })
      } else if (await probeServer()) {
        finish({ code: 1, reason: 'Standalone server launched and answered an HTTP request; the reported module error was absent.' })
      }
    }, 250)

    deadline = setTimeout(() => {
      finish({ code: 2, reason: 'Timed out before the standalone launch symptom or a working HTTP server could be observed.' })
    }, 20_000)
  })

  process.exitCode = outcome.code
  process.stderr.write(`\n${outcome.reason}\n`)
  printCaptured('standalone output', output)

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      once(child, 'close'),
      new Promise((resolve) => setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        resolve()
      }, 5000)),
    ])
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 2
})

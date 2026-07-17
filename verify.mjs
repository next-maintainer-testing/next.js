import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'

const cwd = process.cwd()
const port = 32000 + (process.pid % 10000)
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
  cwd,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-12000)
  })
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: pathname, timeout: 10000 },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode, body }))
      },
    )
    req.on('timeout', () => req.destroy(new Error('request timed out')))
    req.on('error', reject)
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForReferenceRoute() {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await request('/mypage')
      if (response.status === 200 && response.body.includes('LEGACY_CUSTOM_PAGE_OK')) {
        return
      }
    } catch {
      // The server is still starting.
    }
    await delay(500)
  }
  throw new Error('Timed out waiting for the custom-extension Pages Router route')
}

async function stopChild() {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(10000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

let resultCode = 2
try {
  await waitForReferenceRoute()
  const appResponse = await request('/myotherpage')
  if (appResponse.status === 404 && !appResponse.body.includes('APP_ROUTER_PAGE_OK')) {
    console.log('SYMPTOM PRESENT: /mypage works, but /myotherpage returns 404')
    resultCode = 0
  } else if (appResponse.status === 200 && appResponse.body.includes('APP_ROUTER_PAGE_OK')) {
    console.log('SYMPTOM ABSENT: the App Router page is recognized')
    resultCode = 1
  } else {
    console.error(`CHECK FAILED: unexpected /myotherpage response (${appResponse.status})`)
    console.error(appResponse.body.slice(0, 1000))
    resultCode = 2
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack || error}`)
  console.error(output)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  await stopChild()
}

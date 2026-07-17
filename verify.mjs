import { spawn } from 'node:child_process'
import http from 'node:http'
import process from 'node:process'

const port = 32165
const cwd = new URL('.', import.meta.url).pathname
const output = []
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
  cwd,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output.push(String(chunk))
    if (output.join('').length > 12000) output.shift()
  })
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        if (body.length < 2000) body += chunk
      })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.setTimeout(10000, () => req.destroy(new Error(`request timed out: ${pathname}`)))
    req.on('error', reject)
  })
}

async function waitUntilReady() {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await request('/')
      if (response.status === 200) return response
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Next.js did not serve the home page within 90 seconds')
}

function waitForClose(timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('close', onClose)
      resolve(false)
    }, timeoutMs)
    const onClose = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('close', onClose)
  })
}

async function stopServer() {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  if (!(await waitForClose(5000))) {
    child.kill('SIGKILL')
    await waitForClose(5000)
  }
}

let result = 2
try {
  await waitUntilReady()
  const sitemap = await request('/sitemap.xml')
  if (sitemap.status === 404) {
    console.log('SYMPTOM_PRESENT: home page is available and /sitemap.xml returned HTTP 404')
    result = 0
  } else {
    console.log(`SYMPTOM_ABSENT: home page is available and /sitemap.xml returned HTTP ${sitemap.status}`)
    result = 1
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.message}`)
  console.error(output.join('').slice(-8000))
  result = 2
} finally {
  process.exitCode = result
  await stopServer()
}

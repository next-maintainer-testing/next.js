import { spawn } from 'node:child_process'
import http from 'node:http'

const port = 31000 + Math.floor(Math.random() * 2000)
const child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, '--openssl-legacy-provider'].filter(Boolean).join(' ') },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk.toString() })
child.stderr.on('data', (chunk) => { logs += chunk.toString() })

function getPage() {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 5000 }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolve({ status: response.statusCode, body }))
    })
    request.on('timeout', () => request.destroy(new Error('request timeout')))
    request.on('error', reject)
  })
}

async function observe() {
  let lastError
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with code ${child.exitCode}`)
    try {
      const response = await getPage()
      if (response.status === 200) return response.body
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw lastError || new Error('Next.js did not become ready')
}

let result = 2
try {
  const html = await observe()
  const imageTag = html.match(/<img\b[^>]*alt="missed target"[^>]*>/i)?.[0]
  const srcset = imageTag?.match(/\bsrcset="([^"]*)"/i)?.[1]
  if (!imageTag || !srcset) throw new Error('Rendered image or srcset was not found')
  const includesUnreachableWidth = /(?:[?&]|&amp;)w=3840(?:&|&amp;)[^,]*\s3840w(?:,|$)/.test(srcset)
  const preservesSizes = imageTag.includes('280px')
  result = includesUnreachableWidth && preservesSizes ? 0 : 1
  console.log(JSON.stringify({ symptomPresent: result === 0, includesUnreachableWidth, preservesSizes, srcset }))
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  console.error(logs.slice(-8000))
  result = 2
}

process.exitCode = result
if (child.exitCode === null) child.kill('SIGTERM')
await Promise.race([
  new Promise((resolve) => child.once('close', resolve)),
  new Promise((resolve) => setTimeout(resolve, 5000)),
])
if (child.exitCode === null) child.kill('SIGKILL')

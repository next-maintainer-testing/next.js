import { spawn } from 'node:child_process'
import { once } from 'node:events'

const port = 34567
const origin = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--turbo', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => { output += chunk.toString() })
child.stderr.on('data', (chunk) => { output += chunk.toString() })

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchHtml() {
  const deadline = Date.now() + 90_000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited early with code ${child.exitCode}\n${output}`)
    }
    try {
      const response = await fetch(origin)
      if (response.ok) return await response.text()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await delay(500)
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError}\n${output}`)
}

let result = 2
try {
  const html = await fetchHtml()
  const linkTags = html.match(/<link\b[^>]*>/g) ?? []
  const iconLink = linkTags.find((tag) => /rel=["']icon["']/.test(tag) && /icon\.svg/.test(tag))
  if (!iconLink) throw new Error(`No generated SVG icon link found in HTML:\n${html}`)

  const sizes = iconLink.match(/sizes=["']([^"']+)["']/)?.[1] ?? null
  console.log(`Generated icon link: ${iconLink}`)
  if (sizes === '123x123') {
    console.log('Symptom present: SVG icon was assigned intrinsic sizes="123x123".')
    result = 0
  } else if (sizes === 'any') {
    console.log('Symptom absent: SVG icon uses sizes="any".')
    result = 1
  } else {
    throw new Error(`Unexpected SVG icon sizes value: ${JSON.stringify(sizes)}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  result = 2
}

process.exitCode = result
child.kill('SIGTERM')
if (child.exitCode === null) {
  const closed = once(child, 'close')
  const forced = delay(5_000).then(() => {
    if (child.exitCode === null) child.kill('SIGKILL')
  })
  await Promise.race([closed, forced])
  if (child.exitCode === null) await once(child, 'close')
}

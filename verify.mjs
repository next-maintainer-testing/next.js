import { spawn } from 'node:child_process'
import { once } from 'node:events'

const port = 43102
const origin = `http://127.0.0.1:${port}`
let server
let logs = ''
let code = 2
let observation = 'verification did not complete'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getPage() {
  let lastError
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(2000) })
      if (response.ok) return await response.text()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})`)
    }
    await delay(500)
  }
  throw new Error(`Next.js did not become ready: ${lastError?.message ?? 'timeout'}`)
}

try {
  server = spawn(process.execPath, [
    './node_modules/next/dist/bin/next',
    'dev',
    '--turbopack',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const capture = (chunk) => {
    logs = (logs + chunk.toString()).slice(-12000)
  }
  server.stdout.on('data', capture)
  server.stderr.on('data', capture)

  const html = await getPage()
  const hrefs = [...html.matchAll(/href=["']([^"']+\.css(?:\?[^"']*)?)["']/g)]
    .map((match) => match[1].replaceAll('&amp;', '&'))

  if (hrefs.length === 0) {
    throw new Error('No emitted stylesheet was linked from the rendered page')
  }

  const stylesheets = []
  for (const href of [...new Set(hrefs)]) {
    const response = await fetch(new URL(href, origin), { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`Stylesheet request failed with HTTP ${response.status}`)
    stylesheets.push(await response.text())
  }

  const css = stylesheets.join('\n')
  const hasPrefixed = /-webkit-backdrop-filter\s*:\s*blur\(10px\)/i.test(css)
  const hasStandard = /(^|[^-\w])backdrop-filter\s*:\s*blur\(10px\)/i.test(css)

  if (hasPrefixed && !hasStandard) {
    code = 0
    observation = 'Symptom present: emitted Turbopack CSS retains -webkit-backdrop-filter but drops the following standard backdrop-filter declaration.'
  } else if (hasStandard) {
    code = 1
    observation = `Symptom absent: emitted Turbopack CSS contains the standard backdrop-filter declaration (prefixed declaration present: ${hasPrefixed}).`
  } else {
    throw new Error('Neither expected backdrop-filter declaration was found in emitted CSS')
  }
} catch (error) {
  code = 2
  observation = `Check failed: ${error.message}\n${logs}`
} finally {
  process.exitCode = code
  console.log(observation)
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      once(server, 'exit'),
      delay(5000).then(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
      }),
    ])
  }
}

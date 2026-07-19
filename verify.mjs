import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const port = 41000 + (process.pid % 10000)
const origin = `http://127.0.0.1:${port}`
let output = ''
let child

function renderedLength(html) {
  const match = html.match(/id="array-length"[^>]*>(?:<!-- -->)?(\d+)/)
  return match ? Number(match[1]) : null
}

async function getPage() {
  const response = await fetch(origin, { headers: { accept: 'text/html' } })
  if (!response.ok) throw new Error(`GET / returned HTTP ${response.status}`)
  return response.text()
}

async function waitForPage() {
  let lastError
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      return await getPage()
    } catch (error) {
      lastError = error
      await delay(250)
    }
  }
  throw new Error(`Next.js did not become ready: ${lastError}`)
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
}

async function check() {
  child = spawn(process.execPath, [
    'node_modules/next/dist/bin/next',
    'dev',
    '-H',
    '127.0.0.1',
    '-p',
    String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      process.stderr.write(text)
    })
  }

  const initialHtml = await waitForPage()
  const initialLength = renderedLength(initialHtml)
  if (initialLength !== 2) {
    throw new Error(`Expected initial rendered length 2, received ${initialLength}`)
  }

  const actionInput = initialHtml.match(/name="(\$ACTION_ID_[^"]+)"/)
  if (!actionInput) {
    throw new Error('Could not find the progressively enhanced Server Action form field')
  }

  const form = new FormData()
  form.append(actionInput[1], '')
  const actionResponse = await fetch(origin, {
    method: 'POST',
    headers: { accept: 'text/html' },
    body: form,
    redirect: 'follow',
  })
  const actionHtml = await actionResponse.text()
  if (!actionResponse.ok) {
    throw new Error(`Server Action submission returned HTTP ${actionResponse.status}: ${actionHtml.slice(0, 300)}`)
  }

  for (let attempt = 0; attempt < 40 && !output.includes('CREATE_MUTATION:2->3'); attempt++) {
    await delay(100)
  }
  if (!output.includes('CREATE_MUTATION:2->3')) {
    throw new Error('The Server Action did not log the expected in-memory mutation from 2 to 3')
  }

  const refreshedHtml = await getPage()
  const refreshedLength = renderedLength(refreshedHtml)
  console.log(`Observed successful action mutation 2->3; refreshed Server Component rendered ${refreshedLength}`)

  if (refreshedLength === 2) return 0
  if (refreshedLength === 3) return 1
  throw new Error(`Expected refreshed rendered length 2 or 3, received ${refreshedLength}`)
}

let result = 2
try {
  result = await check()
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  result = 2
} finally {
  process.exitCode = result
  await stopServer()
}

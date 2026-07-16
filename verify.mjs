import { spawn } from 'node:child_process'
import { once } from 'node:events'

const port = 41000 + (process.pid % 1000)
const url = `http://127.0.0.1:${port}/`
const output = []
let child

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function remember(chunk) {
  output.push(String(chunk))
  if (output.length > 200) output.shift()
}

async function stopServer() {
  if (!child || child.exitCode !== null) return

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }

  let timer
  const closed = once(child, 'close')
  const graceExpired = new Promise((resolve) => {
    timer = setTimeout(resolve, 5000, 'timeout')
  })
  const result = await Promise.race([closed, graceExpired])
  clearTimeout(timer)

  if (result === 'timeout' && child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
    await once(child, 'close')
  }
}

try {
  child = spawn(process.execPath, [
    './node_modules/next/dist/bin/next',
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', remember)
  child.stderr.on('data', remember)

  const deadline = Date.now() + 90000
  let response
  let body
  let lastError

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with code ${child.exitCode}`)
    }

    try {
      response = await fetch(url, {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(30000),
      })
      body = await response.text()
      break
    } catch (error) {
      lastError = error
      await delay(500)
    }
  }

  if (body === undefined) {
    throw new Error(`server did not answer: ${lastError ?? 'timeout'}`)
  }

  const reachedNotFoundPage = /NEXT_HTTP_ERROR_FALLBACK;404|name="next-error" content="not-found"/i.test(body)
  const hasHtmlTag = /<html(?:\s|>)/i.test(body)
  const hasBodyTag = /<body(?:\s|>)/i.test(body)

  if (!reachedNotFoundPage) {
    throw new Error('request did not reach the intentional notFound() result')
  }

  const symptomPresent = !hasHtmlTag && !hasBodyTag
  console.log(`GET ${url} -> ${response.status}`)
  console.log(`Root document tags in response: html=${hasHtmlTag}, body=${hasBodyTag}`)
  console.log(symptomPresent
    ? 'Observed reported symptom: the Suspense-wrapped root layout was omitted after notFound().'
    : 'Reported symptom absent: the response retained the root html/body layout.')

  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  console.error(output.join('').slice(-4000))
  process.exitCode = 2
} finally {
  await stopServer()
}

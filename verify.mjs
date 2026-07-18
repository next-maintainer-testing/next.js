import { spawn } from 'node:child_process'
import process from 'node:process'
import { parse } from 'acorn'

const port = 32000 + (process.pid % 20000)
const origin = `http://127.0.0.1:${port}`
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url)
const child = spawn(process.execPath, [nextBin.pathname, 'dev', '-p', String(port)], {
  cwd: new URL('.', import.meta.url),
  detached: process.platform !== 'win32',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk.toString() })
child.stderr.on('data', (chunk) => { logs += chunk.toString() })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const parseOptions = { ecmaVersion: 2019, sourceType: 'script', allowHashBang: true }

async function fetchWithDeadline(url, deadline) {
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with ${child.exitCode}\n${logs.slice(-4000)}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`${url} returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`Timed out fetching ${url}: ${lastError?.message ?? 'unknown error'}\n${logs.slice(-4000)}`)
}

function firstStringLiteral(node) {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const childNode of value) {
        const found = firstStringLiteral(childNode)
        if (found !== null) return found
      }
    } else {
      const found = firstStringLiteral(value)
      if (found !== null) return found
    }
  }
  return null
}

function collectEvalSources(node, result = []) {
  if (!node || typeof node !== 'object') return result
  if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'eval') {
    const source = firstStringLiteral(node.arguments[0])
    if (source !== null) result.push(source)
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const childNode of value) collectEvalSources(childNode, result)
    } else {
      collectEvalSources(value, result)
    }
  }
  return result
}

function parseFailure(code) {
  try {
    parse(code, parseOptions)
    return null
  } catch (error) {
    if (!(error instanceof SyntaxError) || typeof error.pos !== 'number') throw error
    return { error, code }
  }
}

function syntaxFailures(code) {
  const outerFailure = parseFailure(code)
  if (outerFailure) return [outerFailure]
  const ast = parse(code, parseOptions)
  return collectEvalSources(ast).map(parseFailure).filter(Boolean)
}

let outcome = 2
try {
  const deadline = Date.now() + 120_000
  const html = await (await fetchWithDeadline(origin, deadline)).text()
  const sources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1])
  if (sources.length === 0) throw new Error('The development page contained no external scripts')

  const failures = []
  for (const source of new Set(sources)) {
    const url = new URL(source, origin)
    const response = await fetchWithDeadline(url, deadline)
    const code = await response.text()
    const scriptFailures = syntaxFailures(code)
    scriptFailures.sort((a, b) => Number(/ReactDevOverlay|react-dev-overlay|nextjs-container-errors/.test(b.code)) - Number(/ReactDevOverlay|react-dev-overlay|nextjs-container-errors/.test(a.code)))
    const failure = scriptFailures[0]
    if (failure) {
      const start = Math.max(0, failure.error.pos - 50)
      const end = Math.min(failure.code.length, failure.error.pos + 50)
      failures.push({
        script: url.pathname,
        component: /ReactDevOverlay|react-dev-overlay|nextjs-container-errors/.test(failure.code) ? 'react-dev-overlay payload' : 'initial payload',
        message: failure.error.message,
        excerpt: failure.code.slice(start, end).replace(/\s+/g, ' '),
      })
    }
  }

  if (failures.length > 0) {
    console.log(`Safari 12 parse failure reproduced in ${failures.length} initial development script(s).`)
    for (const failure of failures) {
      console.log(`${failure.script} (${failure.component}): ${failure.message}\n  ${failure.excerpt}`)
    }
    outcome = 0
  } else {
    console.log(`All ${new Set(sources).size} initial development scripts parse as ECMAScript 2019, including webpack eval payloads.`)
    outcome = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  outcome = 2
} finally {
  process.exitCode = outcome
  if (child.exitCode === null) {
    try {
      if (process.platform === 'win32') child.kill('SIGTERM')
      else process.kill(-child.pid, 'SIGTERM')
    } catch {}
  }
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    sleep(10_000),
  ])
}

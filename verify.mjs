import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const pagePath = path.join(root, 'app', 'page.js')
const initial = 'WATCH_MARKER_A'
const changed = 'WATCH_MARKER_B'
let child
let output = ''
let finalCode = 2
let originalSource

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function fetchPage(url, wanted, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early (${child.exitCode})\n${output}`)
    try {
      const response = await fetch(url, { cache: 'no-store' })
      last = await response.text()
      if (response.ok && last.includes(wanted)) return last
    } catch {}
    await sleep(250)
  }
  return last
}

async function mmapReplace() {
  const python = [
    'import mmap, sys',
    'p, old, new = sys.argv[1:4]',
    'with open(p, "r+b", buffering=0) as f:',
    '    m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_WRITE)',
    '    i = m.find(old.encode())',
    '    assert i >= 0',
    '    m[i:i+len(old)] = new.encode()',
    '    m.flush()',
    '    m.close()',
  ].join('\n')
  const proc = spawn('python3', ['-c', python, pagePath, initial, changed], { stdio: 'inherit' })
  const code = await new Promise((resolve) => proc.once('close', resolve))
  if (code !== 0) throw new Error(`mmap helper exited ${code}`)
}

try {
  originalSource = await readFile(pagePath, 'utf8')
  if (!originalSource.includes(initial) || initial.length !== changed.length) {
    throw new Error('source markers are invalid')
  }

  const port = await freePort()
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })

  const url = `http://127.0.0.1:${port}/?t=${Date.now()}`
  const first = await fetchPage(url, initial, 60_000)
  if (!first.includes(initial)) throw new Error(`initial page did not compile\n${output}`)

  await mmapReplace()
  const disk = await readFile(pagePath, 'utf8')
  if (!disk.includes(changed)) throw new Error('changed source is not visible on disk')

  const deadline = Date.now() + 8_000
  let latest = first
  while (Date.now() < deadline) {
    latest = await fetchPage(`${url}-${Date.now()}`, changed, 750)
    if (latest.includes(changed)) break
    await sleep(250)
  }

  if (latest.includes(changed)) {
    console.log('ABSENT: Turbopack rebuilt after the no-event source change')
    finalCode = 1
  } else if (latest.includes(initial)) {
    console.log('PRESENT: source is changed on disk but Turbopack still serves the initial marker')
    finalCode = 0
  } else {
    throw new Error(`unexpected response after source change: ${latest.slice(0, 500)}`)
  }
} catch (error) {
  console.error(error?.stack || error)
  finalCode = 2
} finally {
  process.exitCode = finalCode
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('close', resolve)),
      sleep(5_000).then(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      }),
    ])
    if (child.exitCode === null) {
      await new Promise((resolve) => child.once('close', resolve))
    }
  }
  if (originalSource !== undefined) {
    try {
      await writeFile(pagePath, originalSource)
    } catch (error) {
      console.error(`failed to restore source: ${error?.stack || error}`)
      process.exitCode = 2
    }
  }
}

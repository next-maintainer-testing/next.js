import { rm, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const generatedTypes = new URL('./.next/types/link.d.ts', import.meta.url)
const nextCli = new URL('./node_modules/next/dist/bin/next', import.meta.url)
const port = String(30000 + (process.pid % 20000))
const output = []
let child

function record(chunk) {
  output.push(chunk.toString())
  if (output.join('').length > 12000) output.shift()
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const stopped = await Promise.race([exited.then(() => true), delay(5000).then(() => false)])
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}

try {
  await rm(new URL('./.next', import.meta.url), { recursive: true, force: true })
  child = spawn(process.execPath, [nextCli.pathname, 'dev', '--hostname', '127.0.0.1', '--port', port], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', record)
  child.stderr.on('data', record)

  const deadline = Date.now() + 90000
  let types = ''
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early with code ${child.exitCode}`)
    try {
      types = await readFile(generatedTypes, 'utf8')
      if (types.includes('`/@[username]`') || types.includes('`/@${SafeSlug<T>}`')) break
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await delay(200)
  }

  if (types.includes('`/@[username]`')) {
    process.exitCode = 0
    console.log('BUG PRESENT: generated typed route is the literal `/@[username]`.')
  } else if (types.includes('`/@${SafeSlug<T>}`')) {
    process.exitCode = 1
    console.log('BUG ABSENT: generated typed route uses `/@${SafeSlug<T>}`.')
  } else {
    process.exitCode = 2
    console.error('CHECK FAILED: generated link types did not contain the buggy or corrected route form.')
    console.error(types || output.join(''))
  }
} catch (error) {
  process.exitCode = 2
  console.error('CHECK FAILED:', error)
  console.error(output.join(''))
} finally {
  await stopChild()
}

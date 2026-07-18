import { spawn } from 'node:child_process'
import net from 'node:net'

const host = '127.0.0.1'

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
  await exited
  clearTimeout(timer)
}

const port = await freePort()
const child = spawn(process.execPath, [
  'node_modules/next/dist/bin/next',
  'dev',
  '--turbopack',
  '-H', host,
  '-p', String(port),
], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk.toString() })
child.stderr.on('data', (chunk) => { logs += chunk.toString() })

let outcome = 2
let observation = ''
const deadline = Date.now() + 120_000

try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js exited before the check completed\n${logs}`)
    }

    try {
      const response = await fetch(`http://${host}:${port}/`)
      if (response.ok) {
        const html = await response.text()
        const match = html.match(/<p[^>]*id="target"[^>]*class="([^"]*)"[^>]*>text<\/p>/)
        if (!match) throw new Error(`Rendered target was not found in HTML: ${html.slice(0, 1000)}`)

        const classes = match[1].trim().split(/\s+/).filter(Boolean)
        const hasA = classes.some((name) => /(?:^|_)a(?:__|$)/.test(name))
        const hasB = classes.some((name) => /(?:^|_)b(?:__|$)/.test(name))
        const hasC = classes.some((name) => /(?:^|_)c(?:__|$)/.test(name))

        if (!hasB || !hasC) {
          throw new Error(`Unexpected composed class list: ${JSON.stringify(classes)}`)
        }

        observation = `Rendered class list: ${classes.join(' ')}`
        outcome = hasA ? 1 : 0
        break
      }
    } catch (error) {
      if (error instanceof Error && /Rendered target|Unexpected composed/.test(error.message)) throw error
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  if (!observation) throw new Error(`Timed out waiting for Next.js\n${logs}`)
  console.log(observation)
  console.log(outcome === 0
    ? 'Symptom present: transitive class a is missing.'
    : 'Symptom absent: transitive class a is present.')
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  outcome = 2
} finally {
  process.exitCode = outcome
  await stop(child)
}

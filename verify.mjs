import { spawn } from 'node:child_process'
import net from 'node:net'

const cwd = new URL('.', import.meta.url).pathname
let child
let output = ''

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } })
    let text = ''
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`Timed out: ${command} ${args.join(' ')}`))
    }, timeoutMs)
    proc.stdout.on('data', chunk => { text += chunk })
    proc.stderr.on('data', chunk => { text += chunk })
    proc.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    proc.on('exit', code => {
      clearTimeout(timer)
      if (code === 0) resolve(text)
      else reject(new Error(`Command exited ${code}: ${command} ${args.join(' ')}\n${text}`))
    })
  })
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(5000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    })
  ])
}

try {
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], 210000)
  const port = await reservePort()
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  })
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })

  const url = `http://127.0.0.1:${port}/`
  let response
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Next.js server exited ${child.exitCode}\n${output}`)
    try {
      response = await fetch(url)
      if (response.ok) break
    } catch {}
    await delay(200)
  }
  if (!response?.ok) throw new Error(`Could not fetch ${url}\n${output}`)

  const html = await response.text()
  const hasAppleTouchIcon = /<link[^>]+rel=["']apple-touch-icon["'][^>]*>/i.test(html)
  process.exitCode = hasAppleTouchIcon ? 1 : 0
  console.log(hasAppleTouchIcon
    ? 'ABSENT: root HTML contains an apple-touch-icon link for the nested app/icons/apple-icon.png file'
    : 'PRESENT: root HTML omits an apple-touch-icon link for the nested app/icons/apple-icon.png file')
} catch (error) {
  process.exitCode = 2
  console.error(`CHECK_FAILED: ${error.stack || error}`)
} finally {
  await stopServer()
}

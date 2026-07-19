import { spawn } from 'node:child_process'
import net from 'node:net'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
let server = null
let resultCode = 2

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`))
      else if (code !== 0) reject(new Error(`${command} exited with ${code}`))
      else resolve()
    })
  })
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))
  return match ? match[1].replaceAll('&amp;', '&') : null
}

function imageTag(html, id) {
  return html.match(new RegExp(`<img(?=[^>]*\\sid="${id}")[^>]*>`, 'i'))?.[0] ?? null
}

function candidateWidths(srcset) {
  if (!srcset) return []
  return [...srcset.matchAll(/[?&]w=(\d+)/g)].map((match) => Number(match[1]))
}

async function waitForPage(url, logs) {
  let lastError
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js server exited early with ${server.exitCode}: ${logs.join('')}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return await response.text()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Server did not become ready: ${lastError?.message ?? 'unknown error'}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  const exited = new Promise((resolve) => server.once('exit', resolve))
  server.kill('SIGTERM')
  const timer = setTimeout(() => {
    if (server.exitCode === null) server.kill('SIGKILL')
  }, 5000)
  await exited
  clearTimeout(timer)
}

try {
  await run(npm, ['run', 'build'])
  const port = await availablePort()
  const logs = []
  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => logs.push(chunk.toString()))
  server.stderr.on('data', (chunk) => logs.push(chunk.toString()))
  const html = await waitForPage(`http://127.0.0.1:${port}/`, logs)

  const intrinsicTag = imageTag(html, 'intrinsic-large')
  const controlTag = imageTag(html, 'desired-small')
  if (!intrinsicTag || !controlTag) throw new Error('Rendered image elements were not found')

  const intrinsicWidths = candidateWidths(attribute(intrinsicTag, 'srcset'))
  const controlWidths = candidateWidths(attribute(controlTag, 'srcset'))
  const intrinsicStyle = attribute(intrinsicTag, 'style') ?? ''
  const observation = {
    intrinsicWidthAttribute: attribute(intrinsicTag, 'width'),
    intrinsicStyle,
    intrinsicSrcsetWidths: intrinsicWidths,
    controlSrcsetWidths: controlWidths,
  }
  console.log(`OBSERVATION ${JSON.stringify(observation)}`)

  const symptomPresent =
    observation.intrinsicWidthAttribute === '5000' &&
    /width:\s*100px/i.test(intrinsicStyle) &&
    intrinsicWidths.length === 1 &&
    intrinsicWidths[0] >= 3000 &&
    controlWidths.length >= 2 &&
    controlWidths.every((width) => width <= 256)

  resultCode = symptomPresent ? 0 : 1
  console.log(symptomPresent
    ? 'SYMPTOM PRESENT: the CSS-sized 100px image has only one multi-thousand-pixel srcset candidate.'
    : 'SYMPTOM ABSENT: the intrinsic-size image includes display-appropriate responsive candidates.')
} catch (error) {
  console.error(error?.stack ?? error)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  await stopServer()
}

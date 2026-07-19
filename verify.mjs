import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'

const cwd = process.cwd()
const helperPath = path.join(cwd, '.next-repro-browser.cjs')
let server
let serverExited
let serverOutput = ''
let resultCode = 2

const browserCheck = String.raw`
const { chromium } = require('playwright')

;(async () => {
async function navigateWith(locator, destination) {
  await Promise.all([
    page.waitForURL('**/' + destination, { timeout: 30000 }),
    locator.click(),
  ])
  await page.waitForLoadState('networkidle')
}

let browser
let page
let code = 2
try {
  const port = process.argv[2]
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage()
  await page.goto('http://127.0.0.1:' + port + '/a', { waitUntil: 'networkidle' })

  const marker = page.locator('body > div > h2 b')
  const initial = await marker.textContent()
  if (!/^\d{1,3}$/.test(initial || '')) {
    throw new Error('Could not read the rendered layout timestamp: ' + JSON.stringify(initial))
  }

  await navigateWith(page.getByRole('link', { name: '<Link />' }), 'b')
  const afterOrdinaryNavigation = await marker.textContent()
  if (afterOrdinaryNavigation !== initial) {
    throw new Error(
      'Control navigation unexpectedly changed the layout timestamp: ' +
      initial + ' -> ' + afterOrdinaryNavigation
    )
  }

  const observations = []
  let current = afterOrdinaryNavigation
  for (const destination of ['a', 'b', 'a']) {
    const immediateActionButton = page.getByRole('button', {
      name: /await noopAction\(\)\s+router\.push\(href\)/,
    })
    await navigateWith(immediateActionButton, destination)
    const after = await marker.textContent()
    observations.push(current + ' -> ' + after)
    if (after !== current) {
      console.log(
        'SYMPTOM PRESENT: ordinary Link navigation preserved layout timestamp ' +
        initial + ', but navigation immediately after noopAction changed it (' +
        observations.join(', ') + ').'
      )
      code = 0
      break
    }
    current = after
  }

  if (code !== 0) {
    console.log(
      'SYMPTOM ABSENT: ordinary Link navigation and three navigations immediately after ' +
      'noopAction all preserved layout timestamp ' + initial +
      ' (' + observations.join(', ') + ').'
    )
    code = 1
  }
} catch (error) {
  console.error('Browser check failed:', error && error.stack || error)
  code = 2
} finally {
  process.exitCode = code
  if (browser) await browser.close()
}
})().catch((error) => {
  console.error('Browser cleanup failed:', error && error.stack || error)
  process.exitCode = 2
})
`

function appendOutput(chunk) {
  serverOutput = (serverOutput + chunk.toString()).slice(-30000)
}

async function getPort() {
  const socket = net.createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const { port } = socket.address()
  socket.close()
  await once(socket, 'close')
  return port
}

async function waitForServer(port) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error('Next.js exited before becoming ready:\n' + serverOutput)
    }
    try {
      const responses = await Promise.all([
        fetch('http://127.0.0.1:' + port + '/a'),
        fetch('http://127.0.0.1:' + port + '/b'),
      ])
      if (responses.every((response) => response.ok)) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for Next.js:\n' + serverOutput)
}

async function run(command, args) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => process.stdout.write(chunk))
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))
  const [code, signal] = await once(child, 'exit')
  if (signal) return 2
  return code ?? 2
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {}
  const timer = new Promise((resolve) => setTimeout(resolve, 5000, 'timeout'))
  if (await Promise.race([serverExited.then(() => 'exited'), timer]) === 'timeout') {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {}
    await serverExited
  }
}

try {
  const port = await getPort()
  await writeFile(helperPath, browserCheck)

  const installCode = await run('npx', [
    '--yes',
    'playwright@1.61.1',
    'install',
    'chromium',
  ])
  if (installCode !== 0) throw new Error('Failed to install the browser runtime')

  server = spawn(
    process.execPath,
    [path.join(cwd, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd, env: { ...process.env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  server.stdout.on('data', appendOutput)
  server.stderr.on('data', appendOutput)
  serverExited = once(server, 'exit')
  await waitForServer(port)

  resultCode = await run('npm', [
    'exec',
    '--yes',
    '--package=playwright@1.61.1',
    '--',
    'sh',
    '-c',
    'NODE_PATH="$(dirname "$(dirname "$(command -v playwright)")")" node "$1" "$2"',
    'sh',
    helperPath,
    String(port),
  ])
} catch (error) {
  console.error('Verification failed:', error && error.stack || error)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  await stopServer()
  await rm(helperPath, { force: true })
}

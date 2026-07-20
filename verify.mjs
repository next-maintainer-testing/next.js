import { spawn } from 'node:child_process'
import net from 'node:net'
import { firefox } from 'playwright-core'

const timeoutMs = 120_000
let server
let browser
let serverOutput = ''
let outcome = 2

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address()
      socket.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForServer(url, deadline) {
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (${server.exitCode})\n${serverOutput}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}\n${serverOutput}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  const exited = new Promise((resolve) => server.once('exit', resolve))
  server.kill('SIGTERM')
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
  ])
  if (!stopped && server.exitCode === null) {
    server.kill('SIGKILL')
    await exited
  }
}

try {
  const port = await reservePort()
  const url = `http://127.0.0.1:${port}/`
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput += chunk.toString()
      if (serverOutput.length > 20_000) serverOutput = serverOutput.slice(-20_000)
    })
  }

  const deadline = Date.now() + timeoutMs
  await waitForServer(url, deadline)
  browser = await firefox.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle', timeout: Math.max(1, deadline - Date.now()) })

  const input = page.locator('#query')
  await input.scrollIntoViewIfNeeded()
  await input.focus()
  await input.type('x')
  await page.waitForURL((current) => current.searchParams.get('query') === 'x', {
    timeout: Math.max(1, deadline - Date.now()),
  })
  await page.waitForTimeout(750)

  const observation = await page.evaluate(() => ({
    activeElementId: document.activeElement?.id || null,
    inputFocused: document.activeElement === document.querySelector('#query'),
    query: new URL(location.href).searchParams.get('query'),
  }))
  console.log(JSON.stringify(observation))

  if (observation.query !== 'x') {
    throw new Error(`router.replace did not update the URL: ${JSON.stringify(observation)}`)
  }
  outcome = observation.inputFocused ? 1 : 0
} catch (error) {
  console.error(error?.stack || error)
  if (serverOutput) console.error(serverOutput)
  outcome = 2
} finally {
  process.exitCode = outcome
  if (browser) await browser.close().catch((error) => console.error(error))
  await stopServer().catch((error) => console.error(error))
}

import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'

const getPort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    server.close((error) => error ? reject(error) : resolve(port))
  })
})

const waitForServer = async (url, server, logs) => {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before startup (${server.exitCode})\n${logs.join('')}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js\n${logs.join('')}`)
}

let browser
let server
let result = 2
const logs = []

try {
  const port = await getPort()
  const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => logs.push(chunk.toString()))
  server.stderr.on('data', (chunk) => logs.push(chunk.toString()))

  await waitForServer(`${baseUrl}/website/view`, server, logs)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`${baseUrl}/website/view`, { waitUntil: 'networkidle' })

  const counter = page.getByTestId('template-mount-number')
  await counter.waitFor()
  await page.waitForFunction(() => {
    const value = document.querySelector('[data-testid="template-mount-number"]')?.textContent
    return Number(value) > 0
  })
  const before = Number(await counter.textContent())

  await page.getByRole('link', { name: 'Go to edit' }).click()
  await page.waitForURL('**/website/edit')
  await page.getByRole('heading', { name: 'Edit' }).waitFor()
  await page.waitForTimeout(1000)
  const after = Number(await counter.textContent())

  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    throw new Error(`Invalid mount observations: before=${before}, after=${after}`)
  }

  const symptomPresent = after === before
  console.log(JSON.stringify({ before, after, symptomPresent }))
  result = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  if (logs.length) console.error(logs.join(''))
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close()
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
      }, 5000)
      server.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}

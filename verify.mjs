import { spawn } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'
import { chromium } from 'playwright'

async function openPort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for Next.js')
}

async function stopChild(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const stopped = await Promise.race([
    new Promise(resolve => child.once('exit', () => resolve(true))),
    new Promise(resolve => setTimeout(() => resolve(false), 5000)),
  ])
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise(resolve => child.once('exit', resolve))
  }
}

let browser
let child
let result = 2
let logs = ''

try {
  const port = await openPort()
  const origin = `http://127.0.0.1:${port}`
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', chunk => { logs += chunk.toString() })
  child.stderr.on('data', chunk => { logs += chunk.toString() })

  await waitForServer(`${origin}/search?q=initial`, child)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`${origin}/search?q=initial`, { waitUntil: 'networkidle' })

  const fullPage = page.getByTestId('full-search')
  if (!(await fullPage.isVisible())) throw new Error('The hard-loaded full search page was not visible')
  if (await page.getByTestId('search-modal').isVisible()) {
    throw new Error('The intercepted modal was already visible before client navigation')
  }

  await page.getByRole('button', { name: 'Update query' }).click()
  await page.waitForURL('**/search?q=updated')
  await page.waitForTimeout(1000)

  const updatedQuery = await page.getByTestId('full-query').textContent()
  if (updatedQuery !== 'updated') {
    throw new Error(`The full page did not update its query (observed ${JSON.stringify(updatedQuery)})`)
  }

  const modalVisible = await page.getByTestId('search-modal').isVisible()
  result = modalVisible ? 0 : 1
  process.exitCode = result
  console.log(modalVisible
    ? 'SYMPTOM PRESENT: router.replace on the hard-loaded /search page opened the intercepted search modal.'
    : 'SYMPTOM ABSENT: router.replace updated the hard-loaded /search page without opening the intercepted modal.')
} catch (error) {
  result = 2
  process.exitCode = result
  console.error(`CHECK FAILED: ${error.stack || error}`)
  if (logs) console.error(logs.slice(-8000))
} finally {
  process.exitCode = result
  if (browser) await browser.close()
  if (child) await stopChild(child)
}

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const expectedPageTitle = 'Metadata: Page'
const fallbackLayoutTitle = 'Metadata: Root Layout'
const port = 31081
let browser
let server

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? `exit ${code}`}`))
    })
  })
}

async function waitForServer(url) {
  let lastError
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Server did not become ready: ${lastError}`)
}

try {
  await run('npm', ['run', 'build'], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } })
  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.pipe(process.stdout)
  server.stderr.pipe(process.stderr)

  const url = `http://127.0.0.1:${port}/`
  await waitForServer(url)
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle0' })
  await new Promise((resolve) => setTimeout(resolve, 500))
  const observed = await page.evaluate(() => ({
    documentTitle: document.title,
    titles: [...document.querySelectorAll('title')].map((element) => element.textContent),
  }))

  console.log(JSON.stringify(observed))

  if (observed.documentTitle === fallbackLayoutTitle && observed.titles.includes(expectedPageTitle)) {
    console.error('BUG REPRODUCED: direct browser visit uses fallback layout title instead of page title')
    process.exitCode = 0
  } else if (observed.documentTitle === expectedPageTitle) {
    console.log('BUG ABSENT: direct browser visit uses the inline page title')
    process.exitCode = 1
  } else {
    console.error(`CHECK FAILED: unexpected title state ${JSON.stringify(observed)}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      once(server, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
    if (server.exitCode === null) {
      server.kill('SIGKILL')
      await once(server, 'exit')
    }
  }
}

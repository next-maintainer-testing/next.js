import { spawn } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

async function waitForServer(url, child, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error('Timed out waiting for next dev')
}

async function chromiumExecutable() {
  try {
    const bundled = chromium.executablePath()
    await access(bundled, constants.X_OK)
    return bundled
  } catch {}

  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/root/.cache/ms-playwright',
    path.join(process.env.HOME || '', '.cache', 'ms-playwright'),
  ].filter(Boolean)

  for (const root of roots) {
    let entries
    try {
      entries = (await readdir(root)).filter((entry) => entry.startsWith('chromium_headless_shell-')).sort().reverse()
    } catch {
      continue
    }
    for (const entry of entries) {
      const candidate = path.join(root, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
      try {
        await access(candidate, constants.X_OK)
        return candidate
      } catch {}
    }
  }
  throw new Error('No Playwright Chromium executable is available')
}

let child
let browser
let logs = ''
let resultCode = 2
try {
  const port = await freePort()
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { logs += chunk })
  child.stderr.on('data', (chunk) => { logs += chunk })

  const url = `http://127.0.0.1:${port}`
  await waitForServer(url, child)

  browser = await chromium.launch({
    executablePath: await chromiumExecutable(),
    headless: true,
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  const heldScripts = []
  let releaseScripts
  const scriptsReleased = new Promise((resolve) => { releaseScripts = resolve })

  await page.route('**/_next/static/**/*.js*', async (route) => {
    heldScripts.push(route.request().url())
    await scriptsReleased
    await route.continue()
  })

  await page.goto(url, { waitUntil: 'commit', timeout: 30000 })
  await page.waitForSelector('#transparent-image', { state: 'attached', timeout: 10000 })
  await page.waitForFunction(() => {
    const image = document.querySelector('#transparent-image')
    return image?.complete && image.naturalWidth > 0
  }, null, { timeout: 10000 })

  const beforeHydration = await page.$eval('#transparent-image', (image) => ({
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    backgroundImage: image.style.backgroundImage,
    filter: image.style.filter,
  }))

  releaseScripts()
  await page.unrouteAll({ behavior: 'wait' })

  let removedAfterHydration = false
  try {
    await page.waitForFunction(() => {
      const image = document.querySelector('#transparent-image')
      return image && (!image.style.backgroundImage || image.style.backgroundImage === 'none')
    }, null, { timeout: 15000 })
    removedAfterHydration = true
  } catch {}

  const placeholderVisibleAfterLoad =
    beforeHydration.complete &&
    beforeHydration.naturalWidth > 0 &&
    Boolean(beforeHydration.backgroundImage) &&
    beforeHydration.backgroundImage !== 'none'

  console.log(JSON.stringify({
    symptom: placeholderVisibleAfterLoad,
    heldHydrationScripts: heldScripts.length,
    beforeHydration,
    removedAfterHydration,
  }))

  resultCode = placeholderVisibleAfterLoad && removedAfterHydration ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  if (logs) console.error(logs.slice(-8000))
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (browser) await browser.close().catch(() => {})
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(5000),
    ])
    if (child.exitCode === null) child.kill('SIGKILL')
  }
}

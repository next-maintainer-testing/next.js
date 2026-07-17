import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const root = process.cwd()
const itemFile = path.join(root, '.item-exists')
const output = []
let server
let browser
let resultCode = 2

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function freePort() {
  const socket = net.createServer()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const { port } = socket.address()
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited early with code ${server.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await delay(250)
  }
  throw new Error('Timed out waiting for Next.js')
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const winner = await Promise.race([exited.then(() => 'exited'), delay(5000).then(() => 'timeout')])
  if (winner === 'timeout' && child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}

try {
  if (fs.existsSync(itemFile)) fs.unlinkSync(itemFile)
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`

  server = spawn(process.execPath, [
    path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
    'dev', '--hostname', '127.0.0.1', '--port', String(port),
  ], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      const text = chunk.toString()
      output.push(text)
      process.stdout.write(text)
    })
  }

  await waitForServer(origin, 120000)
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
  })
  const page = await browser.newPage()

  await page.goto(origin, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.click('button')
  await page.waitForSelector('a[href="/items/1"]', { timeout: 30000 })
  await page.click('a[href="/items/1"]')
  await page.waitForSelector('button', { timeout: 30000 })
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Item 1', { timeout: 30000 })

  const beforeDelete = output.join('').split('DETAIL_RENDER id=1 exists=false').length - 1
  await page.click('button')
  await page.waitForFunction(() => location.pathname === '/', { timeout: 30000 })
  await delay(2000)

  const afterDelete = output.join('').split('DETAIL_RENDER id=1 exists=false').length - 1
  const reproduced = afterDelete > beforeDelete
  console.log(`VERIFY_RESULT old_detail_reexecuted_after_delete=${reproduced}`)
  resultCode = reproduced ? 0 : 1
} catch (error) {
  console.error('VERIFY_ERROR', error?.stack || error)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (browser) {
    try {
      await browser.close()
    } catch (error) {
      console.error('VERIFY_CLEANUP_ERROR browser', error?.stack || error)
      process.exitCode = 2
    }
  }
  try {
    await stopServer(server)
  } catch (error) {
    console.error('VERIFY_CLEANUP_ERROR server', error?.stack || error)
    process.exitCode = 2
  }
  if (fs.existsSync(itemFile)) fs.unlinkSync(itemFile)
}

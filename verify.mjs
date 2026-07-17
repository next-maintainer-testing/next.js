import { spawn } from 'node:child_process'
import net from 'node:net'

const cwd = new URL('.', import.meta.url)

function getPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early with ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.status < 500) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('next dev did not become ready')
}

async function stop(child) {
  if (child.exitCode !== null) return
  await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

let server
try {
  const port = await getPort()
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  })
  const url = `http://127.0.0.1:${port}/missing`
  await waitForServer(url, server)
  const response = await fetch(url)
  const html = await response.text()
  const customUiRendered = html.includes('Custom not-found UI')
  const customTitleRendered = html.includes('<title>Custom missing title</title>') ||
    html.includes('<title>Custom missing title | Issue 45620</title>')

  if (response.status !== 404 || !customUiRendered) {
    throw new Error(`unexpected response: status=${response.status}, customUi=${customUiRendered}`)
  }

  if (customTitleRendered) {
    console.log('SYMPTOM_ABSENT: not-found metadata title is present in the 404 HTML')
    process.exitCode = 1
  } else {
    console.log('SYMPTOM_PRESENT: custom not-found UI rendered with 404 status, but its exported metadata title is absent')
    process.exitCode = 0
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  process.exitCode = 2
} finally {
  if (server) await stop(server)
}

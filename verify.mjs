import http from 'node:http'
import net from 'node:net'
import next from 'next'

const host = '127.0.0.1'
const rawTarget = '/test/bn?bob=price%3A8+to+10&page=2'
let app
let server
let outcome = 2

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, host, () => {
      const address = socket.address()
      socket.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

function listen(serverToStart, port) {
  return new Promise((resolve, reject) => {
    serverToStart.once('error', reject)
    serverToStart.listen(port, host, resolve)
  })
}

function closeServer(serverToClose) {
  return new Promise((resolve, reject) => {
    if (!serverToClose?.listening) return resolve()
    serverToClose.close((error) => error ? reject(error) : resolve())
  })
}

try {
  const port = await reservePort()
  app = next({
    dev: true,
    dir: process.cwd(),
    hostname: host,
    port,
  })
  await app.prepare()

  const handle = app.getRequestHandler()
  server = http.createServer((request, response) => handle(request, response))
  await listen(server, port)

  const response = await fetch(`http://${host}:${port}${rawTarget}`)
  if (!response.ok) throw new Error(`Next.js returned HTTP ${response.status}`)
  const html = await response.text()
  const escapedChangedPath = '/test/bn?bob=price%3A8%20to%2010&amp;page=2'
  const escapedOriginalPath = '/test/bn?bob=price%3A8+to+10&amp;page=2'
  const changed = html.includes(escapedChangedPath)
  const preserved = html.includes(escapedOriginalPath)

  if (changed && !preserved) {
    console.log(`SYMPTOM_PRESENT: request target ${rawTarget} became /test/bn?bob=price%3A8%20to%2010&page=2 in runtime-rendered asPath`)
    outcome = 0
  } else if (preserved && !changed) {
    console.log(`SYMPTOM_ABSENT: runtime-rendered asPath preserved ${rawTarget}`)
    outcome = 1
  } else {
    console.error('CHECK_FAILED: response did not contain exactly one expected runtime-rendered asPath')
    outcome = 2
  }
} catch (error) {
  console.error('CHECK_FAILED:', error?.stack || error)
  outcome = 2
} finally {
  process.exitCode = outcome
  try {
    await closeServer(server)
    await app?.close()
  } catch (error) {
    console.error('CHECK_FAILED_DURING_CLEANUP:', error?.stack || error)
    process.exitCode = 2
  }
}

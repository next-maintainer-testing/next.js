import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const http = require('http')
const net = require('net')
const { spawn } = require('child_process')
const jpeg = require('jpeg-js')

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path, headers }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.setTimeout(10_000, () => req.destroy(new Error('request timed out')))
    req.once('error', reject)
  })
}

async function waitForServer(port, child) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    try {
      const response = await request(port, '/alpha.webp')
      if (response.status === 200) return
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Next.js did not become ready within 60 seconds')
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

function averageRegion(decoded, startX, endX) {
  const totals = [0, 0, 0]
  let count = 0
  for (let y = 0; y < decoded.height; y++) {
    for (let x = startX; x < endX; x++) {
      const offset = (y * decoded.width + x) * 4
      totals[0] += decoded.data[offset]
      totals[1] += decoded.data[offset + 1]
      totals[2] += decoded.data[offset + 2]
      count++
    }
  }
  return totals.map((total) => Math.round(total / count))
}

async function main() {
  const port = await reservePort()
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: __dirname,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })

  let exitCode = 2
  try {
    await waitForServer(port, child)
    const response = await request(port, '/_next/image?url=%2Falpha.webp&w=64&q=75', { Accept: 'image/jpeg' })
    if (response.status !== 200) {
      throw new Error(`optimizer returned HTTP ${response.status}: ${response.body.toString('utf8').slice(0, 300)}`)
    }

    const contentType = String(response.headers['content-type'] || '').split(';')[0]
    if (contentType !== 'image/jpeg') {
      console.log(`ABSENT: optimizer preserved transparency with content-type ${contentType}`)
      exitCode = 1
    } else {
      const decoded = jpeg.decode(response.body, { useTArray: true })
      const left = averageRegion(decoded, 0, Math.floor(decoded.width / 4))
      const right = averageRegion(decoded, Math.ceil(decoded.width * 3 / 4), decoded.width)
      const transparentAreaBecameBlack = Math.max(...left) <= 20
      const opaqueRedAreaSurvived = right[0] >= 180 && right[1] <= 40 && right[2] <= 40
      if (transparentAreaBecameBlack && opaqueRedAreaSurvived) {
        console.log(`PRESENT: alpha WebP became ${contentType}; transparent area is black (RGB ${left.join(',')}) while opaque red remains (RGB ${right.join(',')})`)
        exitCode = 0
      } else {
        console.log(`ABSENT: output did not reproduce black transparency (left RGB ${left.join(',')}; right RGB ${right.join(',')})`)
        exitCode = 1
      }
    }
  } catch (error) {
    console.error(`CHECK_FAILED: ${error.stack || error}`)
    if (logs) console.error(logs.slice(-4000))
    exitCode = 2
  } finally {
    process.exitCode = exitCode
    await stopServer(child)
  }
}

main().catch((error) => {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  process.exitCode = 2
})

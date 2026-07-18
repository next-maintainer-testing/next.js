import { spawn } from 'node:child_process'
import net from 'node:net'
import { SaxesParser } from 'saxes'

const expectedRawTitle = 'MD0186 肉【钟宛冰&苏语棠】'
let child
let resultCode = 2

async function getPort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  if (!port) throw new Error('Could not allocate a port')
  return port
}

async function waitForResponse(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) {
      throw new Error(`Next.js exited before serving the sitemap (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`)
}

function parseXml(xml) {
  let parseError
  const parser = new SaxesParser({ xmlns: false })
  parser.on('error', error => {
    parseError = error
  })
  try {
    parser.write(xml).close()
  } catch (error) {
    parseError = error
  }
  return parseError
}

async function verify() {
  const port = await getPort()
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let logs = ''
  child.stdout.on('data', chunk => { logs += chunk.toString() })
  child.stderr.on('data', chunk => { logs += chunk.toString() })

  const url = `http://127.0.0.1:${port}/sitemap/1.xml`
  try {
    const response = await waitForResponse(url, 120_000)
    const contentType = response.headers.get('content-type') || ''
    const xml = await response.text()
    if (!contentType.includes('xml')) {
      console.error(`Verification failed: expected an XML response, received ${contentType}`)
      return 2
    }

    const parseError = parseXml(xml)
    const hasRawTitle = xml.includes(expectedRawTitle)
    if (hasRawTitle && parseError) {
      console.log(`Symptom reproduced: ${url} contains the unescaped video title and is not well-formed XML (${parseError.message})`)
      return 0
    }
    if (!parseError) {
      console.log(`Symptom absent: ${url} is well-formed XML; raw unescaped title present=${hasRawTitle}`)
      return 1
    }

    console.error(`Verification failed: XML was malformed for an unexpected reason (${parseError.message})`)
    return 2
  } catch (error) {
    console.error(error)
    console.error(logs.slice(-4000))
    return 2
  }
}

async function cleanup() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 10_000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise(resolve => child.once('exit', resolve))
  }
}

try {
  resultCode = await verify()
} catch (error) {
  console.error(error)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  await cleanup()
}

import { spawn } from 'node:child_process'
import net from 'node:net'

const reportedError = /Page ["']?\/sitemap\.xml\/\[\[\.\.\.__metadata_id__\]\]\/route["']? is missing exported function ["']generateStaticParams\(\)["'], which is required with ["']output: export["'] config/
const sitemapXml = /<urlset[\s>]/

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let child
let exitCode = 2
try {
  const port = await reservePort()
  let output = ''
  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  const deadline = Date.now() + 120_000
  let response
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with code ${child.exitCode}\n${output}`)
    }
    try {
      response = await fetch(`http://127.0.0.1:${port}/sitemap.xml`)
      break
    } catch {
      await sleep(250)
    }
  }
  if (!response) throw new Error(`next dev did not become reachable\n${output}`)

  const body = await response.text()
  const observed = `${body}\n${output}`
  if (reportedError.test(observed)) {
    console.log(`REPRODUCED: GET /sitemap.xml returned the reported generateStaticParams error (HTTP ${response.status}).`)
    exitCode = 0
  } else if (response.ok && sitemapXml.test(body)) {
    console.log(`NOT REPRODUCED: GET /sitemap.xml returned sitemap XML (HTTP ${response.status}).`)
    exitCode = 1
  } else {
    throw new Error(`Unexpected response from /sitemap.xml (HTTP ${response.status}).\n${observed}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(5_000).then(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      }),
    ])
  }
}

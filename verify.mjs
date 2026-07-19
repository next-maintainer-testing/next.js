import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const cwd = process.cwd()
const nextBin = join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next')
const deploymentA = join(cwd, '.out-a')
const deploymentB = join(cwd, '.out-b')
const requestPath = '/article.txt?_rsc=acgkz'

function removeBuildProducts() {
  rmSync(join(cwd, '.next'), { recursive: true, force: true })
  rmSync(join(cwd, 'out'), { recursive: true, force: true })
}

function runBuild(marker) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, 'build'], {
      cwd,
      env: { ...process.env, BUILD_MARKER: marker, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal || code !== 0) {
        reject(new Error(`next build failed for ${marker}: code=${code} signal=${signal}`))
      } else {
        resolve()
      }
    })
  })
}

async function createDeployment(marker, destination) {
  removeBuildProducts()
  rmSync(destination, { recursive: true, force: true })
  await runBuild(marker)
  if (!existsSync(join(cwd, 'out'))) {
    throw new Error('next build completed without producing the static out directory')
  }
  renameSync(join(cwd, 'out'), destination)
}

function contentType(file) {
  if (extname(file) === '.txt') return 'text/x-component'
  if (extname(file) === '.html') return 'text/html; charset=utf-8'
  return 'application/octet-stream'
}

let activeRoot = deploymentA
const server = createServer((request, response) => {
  try {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname
    const relative = normalize(pathname).replace(/^[/\\]+/, '')
    const file = join(activeRoot, relative)
    if (!file.startsWith(`${activeRoot}/`) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('not found')
      return
    }
    response.writeHead(200, {
      'content-type': contentType(file),
      'cache-control': 'public, max-age=31536000, immutable',
    })
    response.end(readFileSync(file))
  } catch (error) {
    response.writeHead(500).end(String(error))
  }
})

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

try {
  await createDeployment('deployment-A', deploymentA)
  await createDeployment('deployment-B', deploymentB)

  await listen()
  const address = server.address()
  const url = `http://127.0.0.1:${address.port}${requestPath}`

  activeRoot = deploymentA
  const first = await fetch(url)
  const firstBody = await first.text()

  activeRoot = deploymentB
  const second = await fetch(url)
  const secondBody = await second.text()

  const sameUnversionedUrlChanged =
    first.status === 200 &&
    second.status === 200 &&
    first.headers.get('content-type')?.startsWith('text/x-component') &&
    second.headers.get('content-type')?.startsWith('text/x-component') &&
    firstBody.includes('deployment-A') &&
    secondBody.includes('deployment-B') &&
    firstBody !== secondBody

  if (sameUnversionedUrlChanged) {
    console.log(`SYMPTOM_PRESENT: ${requestPath} returned different RSC payloads for deployment-A and deployment-B`)
    console.log(`payloadBytes=${firstBody.length},${secondBody.length}; cache URL is unchanged across builds`)
    process.exitCode = 0
  } else {
    console.log(`SYMPTOM_ABSENT: the same unversioned RSC URL did not expose mutable deployment payloads`)
    console.log(`statuses=${first.status},${second.status}; markers=${firstBody.includes('deployment-A')},${secondBody.includes('deployment-B')}`)
    process.exitCode = 1
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  process.exitCode = 2
} finally {
  if (server.listening) {
    try {
      await close()
    } catch (error) {
      console.error('CHECK_FAILED during server cleanup:', error)
      process.exitCode = 2
    }
  }
  removeBuildProducts()
  rmSync(deploymentA, { recursive: true, force: true })
  rmSync(deploymentB, { recursive: true, force: true })
}

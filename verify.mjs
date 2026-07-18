import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const port = 34109
const baseUrl = `http://127.0.0.1:${port}`
const deadline = Date.now() + 270_000
let server = null
let result = 2

function remaining() {
  return Math.max(1, deadline - Date.now())
}

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, NODE_OPTIONS: '--openssl-legacy-provider', ...env },
      stdio: 'inherit',
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${command} timed out`))
    }, remaining())
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(fullPath))
    else files.push(fullPath)
  }
  return files
}

async function waitForServer() {
  let lastError
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`next start exited with ${server.exitCode}`)
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
      lastError = new Error(`server returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError ?? new Error('server did not become ready')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

try {
  await fs.rm(path.join(root, '.next'), { recursive: true, force: true })
  await run(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'])

  const mediaDirectory = path.join(root, '.next', 'static', 'media')
  const mediaFiles = await listFiles(mediaDirectory).catch(() => [])
  const workerAssets = mediaFiles.filter((file) => path.extname(file) === '.ts')

  server = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)], {
    cwd: root,
    env: { ...process.env, NODE_OPTIONS: '--openssl-legacy-provider' },
    stdio: 'inherit',
  })
  await waitForServer()

  const observations = []
  for (const file of workerAssets) {
    const relative = path.relative(path.join(root, '.next'), file).split(path.sep).join('/')
    const assetUrl = `${baseUrl}/_next/${relative}`
    const response = await fetch(assetUrl)
    const contentType = response.headers.get('content-type') ?? ''
    observations.push({ path: `/_next/${relative}`, status: response.status, contentType })
  }

  const badAsset = observations.find((item) => item.status === 200 && /^video\/mp2t(?:;|$)/i.test(item.contentType))
  if (badAsset) {
    console.log(`SYMPTOM_PRESENT ${JSON.stringify(badAsset)}`)
    result = 0
  } else {
    console.log(`SYMPTOM_ABSENT ${JSON.stringify({ workerAssets: workerAssets.length, observations })}`)
    result = 1
  }
} catch (error) {
  console.error(`CHECK_FAILED ${error?.stack ?? error}`)
  result = 2
} finally {
  process.exitCode = result
  await stopServer()
}

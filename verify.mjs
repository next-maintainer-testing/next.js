import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import process from 'node:process'

const root = process.cwd()
const port = 32000 + (process.pid % 1000)
let server = null
let outcome = 2

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const append = (chunk) => {
      output += chunk.toString()
      if (output.length > 20000) output = output.slice(-20000)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`${command} ${args.join(' ')} failed (${code ?? signal})\n${output}`))
    })
  })
}

function waitForClose(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return resolve()
    const force = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.once('close', () => {
      clearTimeout(force)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

async function fetchChild() {
  let lastError
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/child`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error(`Server did not serve /child: ${lastError}`)
}

try {
  await rm(`${root}/.next`, { recursive: true, force: true })

  const nextPackage = JSON.parse(await readFile(`${root}/node_modules/next/package.json`, 'utf8'))
  const major = Number.parseInt(nextPackage.version, 10)
  const buildArgs = ['build']
  // Next 15 builds with webpack by default; Next 16 needs this flag to test the same bundler.
  if (major >= 16) buildArgs.push('--webpack')
  await run(`${root}/node_modules/.bin/next`, buildArgs, 210000)

  server = spawn(`${root}/node_modules/.bin/next`, ['start', '-p', String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', () => {})
  server.stderr.on('data', () => {})

  const html = await fetchChild()
  const manifest = JSON.parse(await readFile(`${root}/.next/app-build-manifest.json`, 'utf8'))
  const rootAssets = manifest.pages?.['/page']
  const childAssets = manifest.pages?.['/child/page']
  if (!Array.isArray(rootAssets) || !Array.isArray(childAssets)) {
    throw new Error(`Expected /page and /child/page in app-build-manifest.json; keys: ${Object.keys(manifest.pages ?? {}).join(', ')}`)
  }

  const childSet = new Set(childAssets)
  const parentOnlyJavaScript = rootAssets.filter((asset) => asset.endsWith('.js') && !childSet.has(asset))
  if (parentOnlyJavaScript.length === 0) {
    throw new Error('Build manifest has no JavaScript asset unique to the parent page, so the network symptom cannot be distinguished')
  }

  const loadedAssets = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((match) => match[1].split('?')[0].replace(/^\/_next\//, ''))
  const leakedParentAssets = parentOnlyJavaScript.filter((asset) => loadedAssets.includes(asset))

  console.log(JSON.stringify({
    nextVersion: nextPackage.version,
    route: '/child',
    parentOnlyJavaScript,
    loadedScriptAssets: loadedAssets,
    leakedParentAssets,
    symptom: leakedParentAssets.length > 0
      ? 'The child page response loads JavaScript unique to the parent /page route'
      : 'The child page response does not load JavaScript unique to the parent /page route',
  }, null, 2))
  outcome = leakedParentAssets.length > 0 ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  outcome = 2
} finally {
  process.exitCode = outcome
  await waitForClose(server)
}

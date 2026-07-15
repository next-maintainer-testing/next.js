import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

async function containsHashedExternal(directory) {
  const pending = [directory]
  const pattern = /require-in-the-middle-[0-9a-f]{16}/

  while (pending.length > 0) {
    const current = pending.pop()
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return false
      throw error
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(entryPath)
      } else if (entry.isFile()) {
        const source = await fs.readFile(entryPath, 'utf8').catch(() => '')
        if (pattern.test(source)) return true
      }
    }
  }

  return false
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  if (!(await waitForExit(child, 5000))) {
    child.kill('SIGKILL')
    await waitForExit(child, 5000)
  }
}

let server
try {
  await fs.rm(path.join(root, '.next'), { recursive: true, force: true })

  const build = await run(process.execPath, [nextBin, 'build'])
  if (build.code !== 0) {
    throw new Error(`next build exited with ${build.code}\n${(build.stderr || build.stdout).slice(-4000)}`)
  }

  const serverDirectory = path.join(root, '.next', 'server')
  const aliasDirectory = path.join(root, '.next', 'node_modules')
  const hasReference = await containsHashedExternal(serverDirectory)
  const hasAliasDirectory = await fs.stat(aliasDirectory).then(() => true, () => false)

  if (!hasReference) {
    console.log('SYMPTOM ABSENT: build contains no hashed require-in-the-middle external reference.')
    process.exitCode = 1
  } else if (!hasAliasDirectory) {
    throw new Error('build referenced a hashed external but emitted no .next/node_modules directory')
  } else {
    // The reported archive excludes directories named node_modules, including
    // Next's generated .next/node_modules aliases. Reinstalling root
    // dependencies does not recreate these build-specific aliases.
    await fs.rm(aliasDirectory, { recursive: true, force: true })

    const port = 41000 + (process.pid % 10000)
    server = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let spawnError
    server.stdout.on('data', (chunk) => { output += chunk })
    server.stderr.on('data', (chunk) => { output += chunk })
    server.on('error', (error) => { spawnError = error })

    const missingAlias = /(?:Failed to load external module|Cannot find module)[^\n]*require-in-the-middle-[0-9a-f]{16}/
    const deadline = Date.now() + 30000
    let healthy = false

    while (Date.now() < deadline) {
      if (missingAlias.test(output) || spawnError) break
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`)
        if (response.ok) {
          healthy = true
          break
        }
      } catch {}
      if (server.exitCode !== null && !missingAlias.test(output)) break
      await delay(100)
    }

    if (missingAlias.test(output)) {
      console.log('SYMPTOM PRESENT: production start cannot resolve the hashed require-in-the-middle external after deployment without node_modules.')
      process.exitCode = 0
    } else if (healthy) {
      console.log('SYMPTOM ABSENT: production server served the page after deployment without node_modules.')
      process.exitCode = 1
    } else {
      throw new Error(`server neither served the page nor emitted the reported missing hashed external error\n${spawnError || ''}\n${output.slice(-4000)}`)
    }
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.message}`)
  process.exitCode = 2
} finally {
  if (server) await stopChild(server)
}

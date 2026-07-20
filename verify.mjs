import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const moduleNames = [
  'dist/compiled/@next/react-refresh-utils/dist/runtime.js',
  'dist/compiled/@next/react-refresh-utils/dist/internal/helpers.js',
]

let child
let socket

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pathExists(file) {
  try {
    await access(file, fsConstants.F_OK)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function closeResources() {
  if (socket && socket.readyState < WebSocket.CLOSING) {
    const closed = new Promise((resolve) => {
      socket.addEventListener('close', resolve, { once: true })
    })
    socket.close()
    await Promise.race([closed, wait(1000)])
  }

  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve))
    child.kill('SIGTERM')
    await Promise.race([exited, wait(2000)])
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await new Promise((resolve) => child.once('exit', resolve))
    }
  }
}

async function inspectLoadedModules(targets) {
  const expression = `global.self=global;require(${JSON.stringify(targets[0])})`
  child = spawn(process.execPath, ['--inspect-brk=0', '-e', expression], {
    cwd: process.cwd(),
    stdio: ['ignore', 'ignore', 'pipe'],
  })

  const inspectorUrl = await new Promise((resolve, reject) => {
    let stderr = ''
    const timer = setTimeout(() => reject(new Error(`inspector did not start: ${stderr}`)), 10000)
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      const match = stderr.match(/ws:\/\/[^\s]+/)
      if (match) {
        clearTimeout(timer)
        resolve(match[0])
      }
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      reject(new Error(`debug target exited before inspection (code ${code}, signal ${signal}): ${stderr}`))
    })
  })

  socket = new WebSocket(inspectorUrl)
  const parsed = new Map()

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for debugger to parse: ${targets.join(', ')}`))
    }, 15000)

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Debugger.enable' }))
    })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('inspector WebSocket failed'))
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id === 1) {
        socket.send(JSON.stringify({ id: 2, method: 'Runtime.runIfWaitingForDebugger' }))
        return
      }
      if (message.method === 'Debugger.paused') {
        socket.send(JSON.stringify({ id: 3, method: 'Debugger.resume' }))
        return
      }
      if (message.method !== 'Debugger.scriptParsed') return

      for (const target of targets) {
        const parsedPath = message.params.url.startsWith('file:')
          ? fileURLToPath(message.params.url)
          : message.params.url
        if (path.resolve(parsedPath) === path.resolve(target)) {
          parsed.set(target, {
            url: message.params.url,
            sourceMapURL: message.params.sourceMapURL,
          })
        }
      }

      if (parsed.size === targets.length) {
        clearTimeout(timer)
        resolve()
      }
    })
  })

  return parsed
}

async function main() {
  const nextRoot = path.dirname(require.resolve('next/package.json'))
  const targets = moduleNames.map((name) => path.join(nextRoot, name))

  const targetPresence = await Promise.all(targets.map(pathExists))
  if (targetPresence.some((present) => !present)) {
    console.log('Symptom absent: one or more warned React Refresh JavaScript files are not shipped.')
    return 1
  }

  const parsed = await inspectLoadedModules(targets)
  const observations = []

  for (const target of targets) {
    const sourceMapURL = parsed.get(target)?.sourceMapURL
    if (!sourceMapURL || sourceMapURL.startsWith('data:')) {
      console.log(`Symptom absent: debugger parsed ${path.basename(target)} without an external source map URL.`)
      return 1
    }

    const mapPath = sourceMapURL.startsWith('file:')
      ? fileURLToPath(sourceMapURL)
      : path.resolve(path.dirname(target), sourceMapURL)

    try {
      await readFile(mapPath)
      console.log(`Symptom absent: debugger-advertised map exists: ${mapPath}`)
      return 1
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      observations.push(`${path.basename(target)} -> ${path.basename(mapPath)}: ENOENT`)
    }
  }

  console.log(`Symptom reproduced: ${observations.join('; ')}`)
  return 0
}

let result = 2
try {
  result = await main()
} catch (error) {
  console.error(error?.stack || error)
  result = 2
}

process.exitCode = result
await closeResources()

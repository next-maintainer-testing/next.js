import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const directory = path.dirname(fileURLToPath(import.meta.url))
const port = 3456
let child
let output = ''
let outcome = 2
let observation = 'verification did not complete'

function collect(chunk) {
  output += chunk.toString()
  if (output.length > 200_000) output = output.slice(-200_000)
}

function hasReportedSymptom(text) {
  return /ENOENT/.test(text) && /\.next[\\/]server[\\/]package\.json/.test(text)
}

async function waitForExit(processHandle, timeoutMs) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return true
  return await new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      processHandle.removeListener('exit', onExit)
      resolve(false)
    }, timeoutMs)
    processHandle.once('exit', onExit)
  })
}

try {
  await rm(path.join(directory, '.next'), { recursive: true, force: true })
  child = spawn(process.execPath, [path.join(directory, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: directory,
    env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  const deadline = Date.now() + 90_000
  let requestCompleted = false
  let responseStatus = 0
  let responseBody = ''

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) break
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      responseStatus = response.status
      responseBody = await response.text()
      requestCompleted = true
      collect(responseBody)

      if (hasReportedSymptom(output)) {
        outcome = 0
        observation = `reported ENOENT for .next/server/package.json reproduced (HTTP ${responseStatus})`
        break
      }
      if (response.ok && /function/.test(responseBody)) {
        outcome = 1
        observation = `page rendered successfully without the reported error (HTTP ${responseStatus})`
        break
      }

      await new Promise((resolve) => setTimeout(resolve, 2_000))
      if (hasReportedSymptom(output)) {
        outcome = 0
        observation = `reported ENOENT for .next/server/package.json reproduced (HTTP ${responseStatus})`
      } else {
        outcome = 2
        observation = `page returned HTTP ${responseStatus}, but not the reported symptom`
      }
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  if (!requestCompleted && outcome === 2) {
    observation = child.exitCode === null
      ? 'timed out waiting for the Next.js page'
      : `Next.js exited before serving the page (exit ${child.exitCode}, signal ${child.signalCode})`
  }
} catch (error) {
  outcome = 2
  observation = `verification failed: ${error?.stack || error}`
} finally {
  process.exitCode = outcome
  console.log(observation)
  if (output) console.log(output.slice(-4_000))

  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    const stopped = await waitForExit(child, 5_000)
    if (!stopped) {
      child.kill('SIGKILL')
      await waitForExit(child, 5_000)
    }
  }
}

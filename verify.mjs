import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextPackage = require('next/package.json')
const nextBin = require.resolve('next/dist/bin/next')
const major = Number.parseInt(nextPackage.version.split('.')[0], 10)
const expectedText = 'React alias reproduction'

process.exitCode = 2

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5000),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

async function probe({ alias, port }) {
  const args = [nextBin, 'dev', '-p', String(port), '-H', '127.0.0.1']
  if (major >= 16) args.push('--webpack')

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      REACT_ALIAS: alias ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  const append = (chunk) => {
    output = (output + chunk.toString()).slice(-30000)
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  let response = null
  let body = ''
  const deadline = Date.now() + 120000
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) break
      try {
        response = await fetch(`http://127.0.0.1:${port}/`)
        body = await response.text()
        break
      } catch {
        await delay(500)
      }
    }
    return {
      status: response?.status ?? null,
      hasPage: body.includes(expectedText),
      invalidHook:
        body.includes('Invalid hook call') ||
        body.includes("Cannot read properties of null (reading 'useContext')") ||
        output.includes('Invalid hook call') ||
        output.includes("Cannot read properties of null (reading 'useContext')"),
      output,
    }
  } finally {
    await stop(child)
  }
}

async function main() {
  const basePort = 31000 + (process.pid % 1000) * 2
  const baseline = await probe({ alias: false, port: basePort })
  if (baseline.status !== 200 || !baseline.hasPage) {
    console.error(
      `CHECK_FAILED baseline without aliases did not render: next=${nextPackage.version} status=${baseline.status} marker=${baseline.hasPage}\n${baseline.output}`,
    )
    return 2
  }

  const aliased = await probe({ alias: true, port: basePort + 1 })
  if (aliased.status === 500 && aliased.invalidHook) {
    console.log(
      `SYMPTOM_PRESENT next=${nextPackage.version}: baseline=200, aliased=500 with invalid hook/useContext error`,
    )
    return 0
  }
  if (aliased.status === 200 && aliased.hasPage) {
    console.log(
      `SYMPTOM_ABSENT next=${nextPackage.version}: baseline=200 and aliased=200`,
    )
    return 1
  }

  console.error(
    `CHECK_FAILED unexpected aliased response: next=${nextPackage.version} status=${aliased.status} marker=${aliased.hasPage} invalidHook=${aliased.invalidHook}\n${aliased.output}`,
  )
  return 2
}

try {
  process.exitCode = await main()
} catch (error) {
  console.error('CHECK_FAILED', error)
  process.exitCode = 2
}

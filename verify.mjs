import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const fixture = path.join(root, 'trace-fixture')
const disabledDir = path.join(root, '.next-disabled')
const enabledDir = path.join(root, '.next-enabled')

function fail(message, code = 2) {
  console.error(message)
  process.exitCode = code
}

function runBuild(tracingEnabled) {
  const started = process.hrtime.bigint()
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
    cwd: root,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      TRACING_ENABLED: tracingEnabled ? '1' : '0',
      TRACE_FIXTURE_FILE: 'file-19999.txt',
    },
    encoding: 'utf8',
    timeout: 120_000,
  })
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  if (result.error || result.status !== 0) {
    throw new Error(`next build (${tracingEnabled ? 'enabled' : 'disabled'}) failed: ${result.error || `exit ${result.status}`}\n${output.slice(-4000)}`)
  }
  return { elapsedMs, output }
}

try {
  fs.rmSync(fixture, { recursive: true, force: true })
  fs.rmSync(disabledDir, { recursive: true, force: true })
  fs.rmSync(enabledDir, { recursive: true, force: true })
  fs.mkdirSync(fixture, { recursive: true })
  const payload = 'x'.repeat(512)
  for (let index = 0; index < 20_000; index++) {
    fs.writeFileSync(path.join(fixture, `file-${String(index).padStart(5, '0')}.txt`), `${index}:${payload}`)
  }

  runBuild(false)
  const disabledWarm = runBuild(false)
  runBuild(true)
  const enabledWarm = runBuild(true)

  const disabledTraces = fs.existsSync(disabledDir)
    ? fs.readdirSync(disabledDir, { recursive: true }).filter((name) => String(name).endsWith('.nft.json')).length
    : 0
  const enabledTraces = fs.existsSync(enabledDir)
    ? fs.readdirSync(enabledDir, { recursive: true }).filter((name) => String(name).endsWith('.nft.json')).length
    : 0
  const falseIgnored = disabledTraces > 0
  const slowdown = enabledWarm.elapsedMs / disabledWarm.elapsedMs
  const materialSlowdown = slowdown >= 1.25 && enabledWarm.elapsedMs - disabledWarm.elapsedMs >= 350
  const symptomPresent = materialSlowdown || falseIgnored

  console.log(JSON.stringify({
    disabledWarmMs: Math.round(disabledWarm.elapsedMs),
    enabledWarmMs: Math.round(enabledWarm.elapsedMs),
    slowdown: Number(slowdown.toFixed(2)),
    disabledTraceFiles: disabledTraces,
    enabledTraceFiles: enabledTraces,
    outputFileTracingFalseIgnored: falseIgnored,
    materialTracingSlowdown: materialSlowdown,
    symptomPresent,
  }))

  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  fail(error?.stack || String(error))
} finally {
  fs.rmSync(fixture, { recursive: true, force: true })
}

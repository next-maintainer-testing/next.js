import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextVersion = require('next/package.json').version
const major = Number(nextVersion.split('.')[0])
const nextBin = require.resolve('next/dist/bin/next')
const args = [nextBin, 'build']
if (major >= 16) args.push('--webpack')

rmSync('.next', { recursive: true, force: true })

const result = spawnSync(process.execPath, args, {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})

const output = `${result.stdout || ''}\n${result.stderr || ''}`
const nativePaths = new Set(
  [...output.matchAll(/onnxruntime-node\/bin\/napi-v3\/(darwin|linux|win32)\/(arm64|x64)\/onnxruntime_binding\.node/g)]
    .map((match) => `${match[1]}/${match[2]}`),
)
const overbundledNativePlatforms = nativePaths.size >= 4
const nativeParseFailure = output.includes('Module parse failed') && overbundledNativePlatforms

console.log(`Next.js ${nextVersion}; build exit=${result.status}; native platforms bundled=${[...nativePaths].sort().join(',') || 'none'}`)

if (result.status !== 0 && nativeParseFailure) {
  console.log('SYMPTOM PRESENT: the server route build bundled cross-platform onnxruntime native binaries and failed.')
  process.exitCode = 0
} else if (result.status === 0) {
  console.log('SYMPTOM ABSENT: the production build completed without cross-platform native-binary overbundling.')
  process.exitCode = 1
} else {
  console.error(output.slice(-12000))
  console.error('CHECK FAILED: the build failed for a reason other than the reported native dependency overbundling.')
  process.exitCode = 2
}

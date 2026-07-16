import { spawn } from 'node:child_process'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'

async function filesBelow(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...await filesBelow(full))
    else found.push(full)
  }
  return found
}

async function main() {
  await rm('.next', { recursive: true, force: true })
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--turbopack'], {
    stdio: 'inherit',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (exitCode, signal) => resolve(signal ? null : exitCode))
  })
  if (code !== 0) throw new Error(`next build failed (${code ?? 'signal'})`)

  const traceFiles = (await filesBelow('.next/server')).filter((file) => file.endsWith('.js.nft.json'))
  if (traceFiles.length === 0) throw new Error('build produced no server *.js.nft.json files')

  const matches = []
  for (const traceFile of traceFiles) {
    const trace = JSON.parse(await readFile(traceFile, 'utf8'))
    if (trace.files?.some((file) => file.replaceAll('\\', '/').endsWith('/TRACE_UNRELATED_MARKER.txt'))) {
      matches.push(traceFile)
    }
  }
  console.log(JSON.stringify({ traceFiles: traceFiles.length, markerTracedBy: matches }, null, 2))
  process.exitCode = matches.length > 0 ? 0 : 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 2
})

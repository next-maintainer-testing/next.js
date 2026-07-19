import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => {
  output += chunk
  process.stdout.write(chunk)
})
child.stderr.on('data', (chunk) => {
  output += chunk
  process.stderr.write(chunk)
})

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})

let exitCode = 2
if ('error' in result) {
  console.error(`CHECK_ERROR: unable to start Next.js build: ${result.error.message}`)
} else if (result.signal || result.code !== 0) {
  console.error(`CHECK_ERROR: Next.js build failed (code=${result.code}, signal=${result.signal ?? 'none'})`)
} else {
  const matches = [...output.matchAll(/^ISSUE_77178_LOADED_ENV_FILES=(.*)$/gm)]
  if (matches.length === 0) {
    console.error('CHECK_ERROR: next.config.ts observation marker was not emitted')
  } else {
    try {
      const observations = matches.map((match) => JSON.parse(match[1]))
      const allEmpty = observations.every((files) => Array.isArray(files) && files.length === 0)
      const anyLoaded = observations.some((files) => Array.isArray(files) && files.some((file) => file.path === '.env'))
      const html = await readFile('.next/server/app/index.html', 'utf8')
      const renderedMissing = html.includes('data-env-status="missing"')
      const renderedLoaded = html.includes('data-env-status="loaded"') && html.includes('https://example.com/api')

      console.log(`CHECK_RESULT: loadedEnvFiles lengths=${observations.map((files) => files.length).join(',')}; rendered env status=${renderedMissing ? 'missing' : renderedLoaded ? 'loaded' : 'unknown'}`)
      if (allEmpty && renderedMissing) {
        exitCode = 0
      } else if (anyLoaded && renderedLoaded) {
        exitCode = 1
      } else {
        console.error('CHECK_ERROR: loadEnvConfig output and rendered environment value were inconsistent')
      }
    } catch (error) {
      console.error(`CHECK_ERROR: unable to parse observations or rendered output: ${error.message}`)
    }
  }
}

process.exitCode = exitCode

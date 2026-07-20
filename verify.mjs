import { spawn } from 'node:child_process'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: new URL('.', import.meta.url),
      env: process.env,
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

let exitCode = 2
try {
  const result = await run(
    process.platform === 'win32' ? 'node_modules/.bin/tsc.cmd' : 'node_modules/.bin/tsc',
    ['--pretty', 'false', '--noEmit']
  )
  const output = `${result.stdout}\n${result.stderr}`

  if (result.signal) {
    console.error(`TypeScript was terminated by ${result.signal}`)
  } else if (result.code === 0) {
    console.log('ABSENT: next/font/google accepted a concrete wdth axis value')
    exitCode = 1
  } else if (/repro\.ts\(7,3\).*axes|repro\.ts\(8,5\).*wdth|Type.*wdth.*not assignable|Object literal.*wdth.*does not exist/is.test(output)) {
    console.log('PRESENT: next/font/google rejects a concrete wdth axis value')
    console.log(output.trim())
    exitCode = 0
  } else {
    console.error('CHECK_FAILED: TypeScript failed for an unrelated or unrecognized reason')
    console.error(output.trim())
  }
} catch (error) {
  console.error('CHECK_FAILED: unable to execute TypeScript')
  console.error(error)
}

process.exitCode = exitCode

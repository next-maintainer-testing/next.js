import { spawn } from 'node:child_process'

async function run(command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      CI: '1',
      YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    output += text
    process.stdout.write(text)
  })
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    output += text
    process.stderr.write(text)
  })

  const result = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }))
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  return { ...result, output }
}

const install = await run('yarn', ['install'])
if (install.code !== 0) {
  console.error(`VERIFICATION: Yarn PnP install failed (code=${install.code}, signal=${install.signal ?? 'none'})`)
  if (install.error) console.error(install.error)
  process.exitCode = 2
} else {
  const build = await run('yarn', ['build'])
  const sassAccessError = /tried to access sass(?:\s|,|\()/i.test(build.output)
  const installSassError = /first need to install [`']?sass[`']?/i.test(build.output)
  const symptomPresent = sassAccessError || installSassError

  if (symptomPresent) {
    console.log('VERIFICATION: reported Sass dependency error is present')
    process.exitCode = 0
  } else if (build.code === 0) {
    console.log('VERIFICATION: build succeeded with sass-embedded only; symptom is absent')
    process.exitCode = 1
  } else {
    console.error(`VERIFICATION: build failed for an unrelated or unknown reason (code=${build.code}, signal=${build.signal ?? 'none'})`)
    if (build.error) console.error(build.error)
    process.exitCode = 2
  }
}

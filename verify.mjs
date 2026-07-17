import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const nextVersion = require('next/package.json').version
const thirdPartiesEntry = require.resolve('@next/third-parties/google')
const thirdPartiesPackage = JSON.parse(
  readFileSync(resolve(dirname(thirdPartiesEntry), '../../package.json'), 'utf8')
)
const thirdPartiesVersion = thirdPartiesPackage.version

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

let server
let output = ''
let result = 2

try {
  if (thirdPartiesVersion !== nextVersion) {
    console.log(`Aligning @next/third-parties ${thirdPartiesVersion} to Next.js ${nextVersion}`)
    await run('npm', [
      'install',
      '--no-save',
      '--ignore-scripts',
      `@next/third-parties@${nextVersion}`,
    ])
  }

  const nextCli = require.resolve('next/dist/bin/next')
  const port = 34831
  server = spawn(process.execPath, [nextCli, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  server.stdout.on('data', (chunk) => {
    output += chunk
    process.stdout.write(chunk)
  })
  server.stderr.on('data', (chunk) => {
    output += chunk
    process.stderr.write(chunk)
  })

  let html
  let lastError
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page\n${output}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      if (response.ok) {
        html = await response.text()
        break
      }
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await delay(500)
  }

  if (!html) throw new Error(`Page did not become ready: ${lastError}`)
  if (!html.includes('data-ntpc="GoogleMapsEmbed"')) {
    throw new Error('Rendered page did not contain the GoogleMapsEmbed wrapper')
  }

  const badWidth = /data-ntpc="GoogleMapsEmbed"[^>]*style="[^"]*width:100%px|style="[^"]*width:100%px[^"]*"[^>]*data-ntpc="GoogleMapsEmbed"/.test(html)
  result = badWidth ? 0 : 1
  console.log(badWidth
    ? 'BUG PRESENT: GoogleMapsEmbed rendered width="100%" as width:100%px'
    : 'BUG ABSENT: GoogleMapsEmbed did not render width:100%px')
} catch (error) {
  console.error(error)
  result = 2
} finally {
  process.exitCode = result
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    const stopped = await Promise.race([
      new Promise((resolveStop) => server.once('exit', resolveStop)).then(() => true),
      delay(5000).then(() => false),
    ])
    if (!stopped && server.exitCode === null) {
      server.kill('SIGKILL')
      await new Promise((resolveStop) => server.once('exit', resolveStop))
    }
  }
}

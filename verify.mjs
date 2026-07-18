import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const host = '127.0.0.1'
const port = await new Promise((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, host, () => {
    const address = server.address()
    server.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', host, '--port', String(port)], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let logs = ''
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    logs += chunk.toString()
    if (logs.length > 20000) logs = logs.slice(-20000)
  })
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let resultCode = 2
let observation = ''

try {
  const deadline = Date.now() + 120000
  let ready = false
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with code ${child.exitCode}`)
    try {
      const response = await fetch(`http://${host}:${port}/`)
      if (response.ok) {
        await response.text()
        ready = true
        break
      }
    } catch {}
    await delay(250)
  }
  if (!ready) throw new Error('Next.js did not become ready')

  const response = await fetch(`http://${host}:${port}/definitely-missing-59180`)
  const body = await response.text()
  const customRendered = body.includes('GROUP_CUSTOM_NOT_FOUND_59180')
  const genericRendered = body.includes('This page could not be found')

  observation = `status=${response.status} custom=${customRendered} generic=${genericRendered}`
  if (response.status !== 404) {
    throw new Error(`Unexpected missing-route status: ${observation}`)
  }
  if (customRendered) {
    resultCode = 1
  } else if (genericRendered) {
    resultCode = 0
  } else {
    throw new Error(`Neither custom nor generic not-found UI was observed: ${observation}`)
  }
} catch (error) {
  observation = `${error.stack || error}\n${logs}`
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (child.exitCode === null) child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(10000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    })
  ])
}

console.log(observation)

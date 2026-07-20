import { spawn } from 'node:child_process'
import { once } from 'node:events'

const port = 34142
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, '--openssl-legacy-provider'].filter(Boolean).join(' ') },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })

async function request(path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' })
  return { status: response.status, location: response.headers.get('location'), body: await response.text() }
}

async function waitUntilReady() {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early (${child.exitCode})\n${output}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`next dev did not become ready\n${output}`)
}

let exitCode = 2
try {
  await waitUntilReady()
  const control = await request('/en/test')
  const target = await request('/en/en')

  if (control.status !== 200 || !control.body.includes('SLUG_ROUTE:')) {
    throw new Error(`control route failed: status=${control.status} location=${control.location}`)
  }

  const symptomPresent = target.status === 200 && target.body.includes('HOME_ROUTE') && !target.body.includes('SLUG_ROUTE:')
  console.log(JSON.stringify({
    control: { status: control.status, location: control.location, slugRoute: control.body.includes('SLUG_ROUTE:') },
    target: { status: target.status, location: target.location, homeRoute: target.body.includes('HOME_ROUTE'), slugRoute: target.body.includes('SLUG_ROUTE:') },
    symptomPresent,
  }))
  exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  console.error(output)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (child.exitCode === null) child.kill('SIGTERM')
  await Promise.race([
    once(child, 'exit'),
    new Promise(resolve => setTimeout(resolve, 10000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}

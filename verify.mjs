import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const nextPort = 3100 + Math.floor(Math.random() * 1000)
const probe = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end('{"ok":true}')
})
probe.listen(0, '127.0.0.1')
await once(probe, 'listening')
const probePort = probe.address().port

let output = ''
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--port', String(nextPort)], {
  cwd: process.cwd(),
  env: { ...process.env, PROBE_URL: `http://127.0.0.1:${probePort}/fake-request` },
  stdio: ['ignore', 'pipe', 'pipe']
})
next.stdout.on('data', chunk => { output += chunk })
next.stderr.on('data', chunk => { output += chunk })

try {
  const deadline = Date.now() + 90_000
  while (!output.includes('Ready in') && !output.includes('Ready on') && Date.now() < deadline) {
    if (next.exitCode !== null) throw new Error(`next dev exited early (${next.exitCode})\n${output}`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (Date.now() >= deadline) throw new Error(`Next.js did not become ready\n${output}`)

  output = ''
  const response = await fetch(`http://127.0.0.1:${nextPort}/`)
  if (!response.ok) throw new Error(`document request failed (${response.status})\n${output}`)
  await response.text()
  await new Promise(resolve => setTimeout(resolve, 500))

  const invocations = output.split('ISSUE_66418_FAKE_REQUEST').length - 1
  const symptomPresent = invocations > 1
  console.log(`Observed ${invocations} fakeRequest invocations for one document request; duplicate symptom ${symptomPresent ? 'present' : 'absent'}.`)
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  if (next.exitCode === null) {
    next.kill('SIGTERM')
    await Promise.race([once(next, 'exit'), new Promise(resolve => setTimeout(resolve, 5_000))])
    if (next.exitCode === null) {
      next.kill('SIGKILL')
      await Promise.race([once(next, 'exit'), new Promise(resolve => setTimeout(resolve, 2_000))])
    }
  }
  await new Promise(resolve => probe.close(resolve))
}

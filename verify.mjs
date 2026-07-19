import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const output = []

function append(chunk) {
  const text = chunk.toString()
  output.push(text)
  process.stdout.write(text)
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.on('error', (error) => resolve({ code: null, error, child }))
    child.on('exit', (code, signal) => resolve({ code, signal, child }))
  })
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5000),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

let app
let resultCode = 2

try {
  const build = await run('npm', ['run', 'build'])
  if (build.code !== 0) {
    console.error(`CHECK_FAILED: next build exited with ${build.code ?? build.error}`)
  } else {
    const port = await reservePort()
    app = spawn('npm', ['run', 'start', '--', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    app.stdout.on('data', append)
    app.stderr.on('data', append)

    let requested = false
    for (let attempt = 0; attempt < 60; attempt++) {
      if (app.exitCode !== null || app.signalCode !== null) break
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(1000),
        })
        await response.text()
        requested = true
        break
      } catch {
        await delay(250)
      }
    }

    if (!requested) {
      console.error('CHECK_FAILED: production server did not serve the SSR page')
    } else {
      await delay(500)
      const logs = output.join('')
      const sortCrash = /TypeError: Cannot assign to read only property ['"]0['"] of object/i.test(logs)
      if (sortCrash) {
        console.log('SYMPTOM_PRESENT: production SSR threw while sorting a frozen image config array')
        resultCode = 0
      } else {
        console.log('SYMPTOM_ABSENT: production SSR rendered without the frozen-array sort TypeError')
        resultCode = 1
      }
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
} finally {
  process.exitCode = resultCode
  await stop(app)
}

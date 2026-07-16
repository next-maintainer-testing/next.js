import { spawn } from 'node:child_process'

const port = 32168
let server

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
}

function waitForClose(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true)
      return
    }
    const timer = setTimeout(() => {
      child.removeListener('close', onClose)
      resolve(false)
    }, timeoutMs)
    const onClose = () => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('close', onClose)
  })
}

async function waitForServer(url) {
  const deadline = Date.now() + 90_000
  let lastError
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`next start exited before becoming ready (code=${server.exitCode}, signal=${server.signalCode})`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`server did not become ready: ${lastError}`)
}

async function cleanup() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return
  server.kill('SIGTERM')
  if (!(await waitForClose(server, 10_000))) {
    server.kill('SIGKILL')
    await waitForClose(server, 5_000)
  }
}

try {
  const build = await run('npm', ['run', 'build'])
  if (build.code !== 0) {
    console.error(`CHECK_FAILED: next build exited with code=${build.code}, signal=${build.signal}`)
    process.exitCode = 2
  } else {
    server = spawn('npm', ['run', 'start', '--', '-p', String(port)], {
      stdio: 'inherit',
      env: process.env,
    })
    server.once('error', (error) => console.error('next start error:', error))

    const response = await waitForServer(`http://127.0.0.1:${port}/test/homepage`)
    const html = await response.text()

    if (html.includes('id="slug-missing"')) {
      console.log('SYMPTOM_PRESENT: Edge optional catch-all params resolved without slug for /test/homepage')
      process.exitCode = 0
    } else if (html.includes('id="slug-present"')) {
      console.log('SYMPTOM_ABSENT: Edge optional catch-all params contained slug=homepage')
      process.exitCode = 1
    } else {
      console.error('CHECK_FAILED: unexpected page response')
      console.error(html.slice(0, 2000))
      process.exitCode = 2
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  process.exitCode = 2
} finally {
  await cleanup()
}

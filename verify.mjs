import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'

const port = 32000 + Math.floor(Math.random() * 1000)
const origin = `http://127.0.0.1:${port}`
let server
let result = { before: null, revalidate: null, after: null }

async function get(path) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' })
  return { status: response.status, body: await response.text() }
}

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/item/3`)
      await response.text()
      return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Next.js server did not become ready')
}

async function settlesWithin(promise, milliseconds) {
  let timer
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  const exited = once(server, 'exit')
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    server.kill('SIGTERM')
  }
  if (!(await settlesWithin(exited, 5_000))) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      server.kill('SIGKILL')
    }
    await exited
  }
}

try {
  execFileSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    timeout: 180_000,
  })
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  server.stdout.pipe(process.stdout)
  server.stderr.pipe(process.stderr)

  await waitForServer()
  result.before = await get('/item/3')
  result.revalidate = await get('/api/revalidate?path=/item/3')
  result.after = await get('/item/3')

  const setupWorked =
    result.before.status === 200 &&
    result.before.body.includes('ITEM_PAGE_OK') &&
    result.revalidate.status === 200
  if (!setupWorked) {
    console.error('CHECK_FAILED', JSON.stringify({
      beforeStatus: result.before.status,
      revalidateStatus: result.revalidate.status,
      afterStatus: result.after.status,
    }))
    process.exitCode = 2
  } else if (result.after.status === 404) {
    console.log('SYMPTOM_PRESENT', JSON.stringify({
      beforeStatus: result.before.status,
      revalidateStatus: result.revalidate.status,
      afterStatus: result.after.status,
    }))
    process.exitCode = 0
  } else if (result.after.status === 200 && result.after.body.includes('ITEM_PAGE_OK')) {
    console.log('SYMPTOM_ABSENT', JSON.stringify({
      beforeStatus: result.before.status,
      revalidateStatus: result.revalidate.status,
      afterStatus: result.after.status,
    }))
    process.exitCode = 1
  } else {
    console.error('CHECK_FAILED', JSON.stringify({
      beforeStatus: result.before.status,
      revalidateStatus: result.revalidate.status,
      afterStatus: result.after.status,
    }))
    process.exitCode = 2
  }
} catch (error) {
  console.error('CHECK_FAILED', error instanceof Error ? error.message : String(error))
  process.exitCode = 2
} finally {
  await stopServer()
}

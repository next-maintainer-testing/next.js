import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function htmlVisibleWithoutJavaScript(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, '')
    .replace(/<([a-z][\w:-]*)\b[^>]*\bhidden(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*>[\s\S]*?<\/\1>/gi, '')
}

let server
try {
  const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 180_000,
  })
  if (build.error || build.status !== 0) {
    console.error('CHECK_FAILED: production build failed')
    console.error(build.error?.message || build.stderr || build.stdout)
    process.exitCode = 2
  } else {
    const port = await freePort()
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    server.stderr.on('data', (chunk) => { stderr += chunk })

    let html
    for (let attempt = 0; attempt < 80; attempt++) {
      if (server.exitCode !== null) break
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, {
          headers: { 'user-agent': 'Mozilla/5.0 Chrome/120 (JavaScript disabled)' },
        })
        if (response.ok) {
          html = await response.text()
          break
        }
      } catch {}
      await sleep(250)
    }

    if (!html) {
      console.error('CHECK_FAILED: server did not return the page', stderr)
      process.exitCode = 2
    } else {
      const visible = htmlVisibleWithoutJavaScript(html)
      const loadingVisible = visible.includes('id="loading-state"')
      const contentVisible = visible.includes('id="resolved-content"')
      const contentWasRendered = html.includes('id="resolved-content"')
      const symptomPresent = loadingVisible && !contentVisible && contentWasRendered

      console.log(JSON.stringify({ loadingVisible, contentVisible, contentWasRendered, symptomPresent }))
      process.exitCode = symptomPresent ? 0 : 1
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  process.exitCode = 2
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => server.once('close', resolve)),
      sleep(5_000).then(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
      }),
    ])
  }
}

import http from 'node:http'
import next from 'next'

let app
let server
let resultCode = 2

function listen(serverToListen) {
  return new Promise((resolve, reject) => {
    serverToListen.once('error', reject)
    serverToListen.listen(0, '127.0.0.1', () => {
      serverToListen.off('error', reject)
      resolve()
    })
  })
}

function closeServer(serverToClose) {
  return new Promise((resolve, reject) => {
    serverToClose.close((error) => error ? reject(error) : resolve())
  })
}

try {
  app = next({ dev: true, dir: process.cwd(), hostname: '127.0.0.1', port: 0 })
  await app.prepare()

  const handle = app.getRequestHandler()
  server = http.createServer((request, response) => handle(request, response))
  await listen(server)

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine the local server port')
  }

  const origin = `http://127.0.0.1:${address.port}`
  const nested = await fetch(`${origin}/withbase/about`)
  await nested.text()
  const root = await fetch(`${origin}/withbase`)
  await root.text()

  const nestedHit = nested.headers.get('x-middleware-hit') === 'yes'
  const rootHit = root.headers.get('x-middleware-hit') === 'yes'

  console.log(JSON.stringify({
    root: { status: root.status, middlewareHit: rootHit },
    nested: { status: nested.status, middlewareHit: nestedHit },
  }))

  if (root.status !== 200 || nested.status !== 200 || !nestedHit) {
    throw new Error('Control request did not render successfully through middleware')
  }

  resultCode = rootHit ? 1 : 0
} catch (error) {
  console.error(error)
  resultCode = 2
} finally {
  // Set the durable result before releasing the server and Next.js handles.
  process.exitCode = resultCode
  try {
    if (server?.listening) await closeServer(server)
    if (app && typeof app.close === 'function') await app.close()
  } catch (cleanupError) {
    console.error(cleanupError)
    process.exitCode = 2
  }
}

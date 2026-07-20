const { createServer } = require('node:http')
const next = require('next')
const { WebSocketServer } = require('ws')

const port = Number(process.env.PORT || 3000)
const app = next({ dev: true })
const handle = app.getRequestHandler()
const handleUpgrade = app.getUpgradeHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res))

  server.on('upgrade', (request, socket, head) => {
    handleUpgrade(request, socket, head)
  })

  // This GraphQL-style WebSocket server is intentionally attached directly to
  // the same HTTP server with a path, as described in issue #64128.
  new WebSocketServer({ server, path: '/graphql' })

  server.listen(port, '127.0.0.1', () => {
    console.log(`ready on http://127.0.0.1:${port}`)
  })
})

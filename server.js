const http = require('http')
const next = require('next')
const { parse } = require('url')

const port = Number(process.env.PORT || 3889)
const app = next({ dev: false })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const parsed = parse(req.url, true)
    const pathname = parsed.pathname || '/'

    if (pathname.startsWith('/_next')) {
      return handle(req, res, parsed)
    }

    const hostname = (req.headers.host || '').split(':')[0]
    const renderPath = `/test_app/${hostname}${pathname}`
    return app.render(req, res, renderPath, parsed.query)
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`ready:${port}`)
  })
})

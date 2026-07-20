const http = require('node:http')
const next = require('next')

const hostname = '127.0.0.1'
const port = Number(process.env.PORT || 3000)
const app = next({ dev: false, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  http.createServer(async (req, res) => {
    try {
      if (req.url === '/_health') {
        res.statusCode = 200
        res.end('ok')
        return
      }
      if (req.url === '/a') {
        await app.render(req, res, '/a')
        return
      }
      await handle(req, res)
    } catch (error) {
      console.error(error)
      res.statusCode = 500
      res.end('internal error')
    }
  }).listen(port, hostname, () => {
    console.log(`ready http://${hostname}:${port}`)
  })
})

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const hostname = '127.0.0.1'
const port = Number(process.env.PORT || 3600)

const app = next({
  dev,
  hostname,
  port,
  conf: {
    distDir: '.custom_dist',
  },
})
const handle = app.getRequestHandler()

app
  .prepare()
  .then(() => {
    const server = createServer(async (req, res) => {
      try {
        await handle(req, res, parse(req.url || '', true))
      } catch (error) {
        console.error('Error occurred handling', req.url, error)
        res.statusCode = 500
        res.end('internal server error')
      }
    })

    server.on('error', (error) => {
      console.error('SERVER ERROR:', error.message)
    })

    server.listen(port, hostname, () => {
      console.log(`Ready on http://${hostname}:${port}`)
    })
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 2
  })

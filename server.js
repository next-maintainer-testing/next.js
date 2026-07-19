const http = require('node:http')
const next = require('next')

const port = Number(process.env.PORT || 3000)
const hostname = '127.0.0.1'
const app = next({ dev: true, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  http.createServer((req, res) => handle(req, res)).listen(port, hostname, () => {
    console.log(`ready on http://${hostname}:${port}`)
  })
}).catch((error) => {
  console.error(error)
  process.exitCode = 2
})

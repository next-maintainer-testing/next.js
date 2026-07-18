import http from 'node:http'
import express from 'express'
import next from 'next'

const dev = true
const hostname = process.env.HOSTNAME || '127.0.0.1'
const port = Number(process.env.PORT || 3000)

const nextApp = next({ dev, hostname, port })
const nextHandler = nextApp.getRequestHandler()
const nextUpgradeHandler = nextApp.getUpgradeHandler()

await nextApp.prepare()

const app = express()
const server = http.createServer(app)

app.all('*', (req, res) => nextHandler(req, res))
server.on('upgrade', (req, socket, head) => {
  nextUpgradeHandler(req, socket, head)
})

server.listen(port, hostname, () => {
  console.log(`ready http://${hostname}:${port}`)
})

const express = require('express')
const next = require('next')

const hostname = '127.0.0.1'
const port = Number(process.env.PORT || 3100)

process.on('uncaughtException', (error) => {
  const details = `${error && error.message} ${(error && error.code) || ''}`
  console.error('UNCAUGHT_EXCEPTION', details)
})

const app = next({ dev: false, hostname, port })
const handler = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()
  server.all('*', (req, res) => handler(req, res))
  server.listen(port, hostname, () => {
    console.log(`READY http://${hostname}:${port}`)
  })
})

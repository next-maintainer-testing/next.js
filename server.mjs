import Fastify from 'fastify'
import next from 'next'

const port = Number(process.env.PORT || 3000)
const app = next({ dev: false, dir: process.cwd() })
const handle = app.getRequestHandler()

await app.prepare()

const server = Fastify()
server.all('/*', async (request, reply) => {
  const setBeforeHandle = request.query?.order === 'before'

  if (setBeforeHandle) {
    reply.raw.setHeader('Set-Cookie', 'sessionId=before123; Max-Age=2592000')
  }

  await handle(request.raw, reply.raw)

  if (!setBeforeHandle) {
    try {
      reply.raw.setHeader('Set-Cookie', 'sessionId=after123; Max-Age=2592000')
      console.log('[after-handle-set-header-succeeded]')
    } catch (error) {
      console.log(`[after-handle-set-header-error] ${error?.code || error?.name || 'unknown'}`)
    }
  }

  reply.hijack()
})

await server.listen({ port, host: '127.0.0.1' })
console.log(`[repro-ready] ${port}`)

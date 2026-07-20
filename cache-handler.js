const fs = require('node:fs')
const path = require('node:path')

const logPath = () =>
  process.env.CACHE_HANDLER_LOG || path.join(process.cwd(), 'cache-handler.jsonl')

function record(method, key) {
  fs.appendFileSync(logPath(), `${JSON.stringify({ method, key: String(key ?? '') })}\n`)
}

module.exports = class CacheHandler {
  async get(cacheKey) {
    record('get', cacheKey)
    return null
  }

  async set(cacheKey) {
    record('set', cacheKey)
  }

  async revalidateTag(tag) {
    record('revalidateTag', Array.isArray(tag) ? tag.join(',') : tag)
  }
}

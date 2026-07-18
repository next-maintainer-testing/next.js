const path = require('node:path')

const originalJoin = path.join
path.join = function observedJoin(...parts) {
  const result = originalJoin.apply(this, parts)
  const normalized = result.replaceAll('\\', '/')
  const stack = new Error().stack || ''
  if (
    normalized.endsWith('/next/dist/client/components/navigation') &&
    /webpack-config/.test(stack)
  ) {
    global.__NEXT_WINDOWS_EDGE_ALIAS_FIXED__ = true
  }
  return result
}

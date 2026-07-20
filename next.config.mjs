import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const major = Number(require('next/package.json').version.split('.')[0])

export default major >= 16
  ? { cacheComponents: true }
  : { experimental: { dynamicIO: true } }

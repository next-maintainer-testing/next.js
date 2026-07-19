const major = Number(require('next/package.json').version.split('.')[0])

module.exports = major >= 16
  ? { cacheComponents: true }
  : { experimental: { dynamicIO: true } }

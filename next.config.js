const major = Number(require('next/package.json').version.split('.')[0])

module.exports = major < 14 ? { experimental: { appDir: true } } : {}

const nextMajor = Number.parseInt(require('next/package.json').version.split('.')[0], 10)

module.exports = nextMajor >= 14 ? { output: 'export' } : {}

const nextMajor = Number(require('next/package.json').version.split('.')[0])

/** @type {import('next').NextConfig} */
const nextConfig = nextMajor >= 16
  ? { cacheComponents: true }
  : { experimental: { dynamicIO: true } }

module.exports = nextConfig

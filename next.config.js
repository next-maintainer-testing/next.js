const major = Number(require('next/package.json').version.split('.')[0])

/** @type {import('next').NextConfig} */
const nextConfig = major >= 15
  ? { typedRoutes: true }
  : { experimental: { appDir: true, typedRoutes: true } }

module.exports = nextConfig

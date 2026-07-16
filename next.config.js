/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
  async rewrites() {
    return [
      {
        source: '/@:username',
        destination: '/user/:username',
      },
    ]
  },
}

module.exports = nextConfig

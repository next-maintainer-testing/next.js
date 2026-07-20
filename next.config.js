const upstreamPort = process.env.UPSTREAM_PORT || '9443'

module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `https://127.0.0.1:${upstreamPort}/api/:path*`,
        basePath: false,
      },
    ]
  },
}

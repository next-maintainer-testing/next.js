/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/example',
        destination: '/404',
      },
    ]
  },
}

export default nextConfig

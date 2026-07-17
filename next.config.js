/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/redirect',
        destination: 'https://www.example.com/#/login?return=something',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig

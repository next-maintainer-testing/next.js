/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 5,
      static: 20,
    },
  },
}

module.exports = nextConfig

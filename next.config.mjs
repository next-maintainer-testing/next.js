/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    staleTimes: {
      dynamic: 60,
    },
  },
}

export default nextConfig

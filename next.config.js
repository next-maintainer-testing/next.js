/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  generateBuildId: async () => 'release/v1',
}

module.exports = nextConfig

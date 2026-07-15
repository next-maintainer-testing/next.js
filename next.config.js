/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'mdx'],
  experimental: {
    mdxRs: true,
  },
}

const withMDX = require('@next/mdx')()

module.exports = withMDX(nextConfig)

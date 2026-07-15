/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    rules: {
      '*.wasm': {
        loaders: ['file-loader'],
      },
    },
  },
}

export default nextConfig

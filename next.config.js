/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false,
  webpack(config) {
    config.externals.push({ react: 'React' }, { 'react-dom': 'ReactDOM' })
    return config
  },
}

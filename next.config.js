/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {},
  webpack(config, { nextRuntime }) {
    if (nextRuntime === 'edge' && !global.__NEXT_WINDOWS_EDGE_ALIAS_FIXED__) {
      for (const key of Object.keys(config.resolve?.alias || {})) {
        const normalized = key.replaceAll('\\', '/')
        if (normalized.endsWith('/next/dist/client/components/navigation')) {
          delete config.resolve.alias[key]
        }
      }
    }
    return config
  },
}

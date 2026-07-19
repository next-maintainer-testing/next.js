const nextConfig = {
  images: {
    qualities: [75, 85, 90, 100],
  },
  webpack(config) {
    for (const plugin of config.plugins) {
      const definitions = plugin && plugin.definitions
      const key = 'process.env.__NEXT_IMAGE_OPTS'
      if (definitions && definitions[key]) {
        const imageOptions = definitions[key]
        definitions[key] = `(() => { const config = ${imageOptions}; Object.freeze(config.deviceSizes); if (config.qualities) Object.freeze(config.qualities); return config })()`
      }
    }
    return config
  },
}

module.exports = nextConfig

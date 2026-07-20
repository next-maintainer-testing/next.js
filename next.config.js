const nextConfig = {
  output: 'standalone',
  cacheHandler: require.resolve('./cache-handler.mjs'),
  cacheMaxMemorySize: 0,
};

module.exports = nextConfig;

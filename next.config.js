const nextConfig = {
  trailingSlash: true,
  output: "export",
  images: { unoptimized: true },
  webpack(config, { dev, isServer }) {
    if (!isServer) {
      config.output.chunkFilename = dev
        ? "static/chunks/[name]-[hash].js"
        : "static/chunks/[name]-[contenthash].js";
    }
    return config;
  },
};

module.exports = nextConfig;

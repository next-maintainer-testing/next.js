const nextConfig = {
  reactStrictMode: false,
  experimental: {
    staleTimes: {
      static: 5,
    },
  },
};

export default nextConfig;

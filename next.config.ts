import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheHandler: "./cache-handler.mjs",
};

export default nextConfig;

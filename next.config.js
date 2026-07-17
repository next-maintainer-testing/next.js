const major = Number(require("next/package.json").version.split(".")[0]);

/** @type {import("next").NextConfig} */
const nextConfig = major >= 15
  ? { cacheComponents: true }
  : { experimental: { ppr: true } };

module.exports = nextConfig;

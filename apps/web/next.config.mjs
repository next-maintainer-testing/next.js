/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@repro/client-observability',
    '@repro/server-observability',
  ],
};

export default nextConfig;

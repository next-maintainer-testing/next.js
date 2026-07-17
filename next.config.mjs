/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    ppr: 'incremental',
  },
};

export default nextConfig;

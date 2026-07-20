/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    forceSwcTransforms: true,
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          exclude: /node_modules/,
          as: '*.js',
        },
      },
    },
  },
};

module.exports = nextConfig;

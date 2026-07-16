const nextMajor = Number(require('next/package.json').version.split('.')[0]);

module.exports = {
  ...(nextMajor >= 16 ? { cacheComponents: true } : {}),
  experimental: nextMajor < 16 ? { ppr: true } : {},
};

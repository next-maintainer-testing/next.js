/** @type {import('next').NextConfig} */
module.exports = {
  output: 'export',
  generateBuildId: async () => 'deterministic-build-id',
}

const path = require('node:path')

const pnpmGitDependency = path.join(
  __dirname,
  'fixtures/node_modules/.pnpm/is-odd@git+https+++git@github.com+jonschlinkert+is-odd.git#a80ee0d831a8ee69f1fad5b4673491847975eb26/node_modules/is-odd/index.js'
)

module.exports = {
  transpilePackages: ['@repro/git-dependency'],
  webpack(config) {
    config.resolve.alias['@repro/git-dependency'] = pnpmGitDependency
    return config
  },
}

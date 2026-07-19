const path = require('path')

module.exports = {
  webpack(config) {
    if (process.env.REACT_ALIAS !== '0') {
      ;['react', 'react-dom'].forEach((item) => {
        config.resolve.alias[item] = path.resolve(__dirname, 'node_modules', item)
      })
    }
    return config
  },
}

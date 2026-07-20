const tracingEnabled = process.env.TRACING_ENABLED === '1'

module.exports = {
  outputFileTracing: tracingEnabled,
  distDir: tracingEnabled ? '.next-enabled' : '.next-disabled',
}

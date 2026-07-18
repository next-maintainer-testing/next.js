const originalError = Object.defineProperty({}, 'message', {
  configurable: true,
  enumerable: true,
  get() {
    return 'ORIGINAL_INSTRUMENTATION_ERROR_78457'
  },
})

throw originalError

export function register() {}

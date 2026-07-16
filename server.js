// Match the reported custom-server load order: Next is imported first, then a
// helper imports a public request API before Next's Node environment is set up.
require('next')
require('next/headers')

// This is the shared store operation that fails during server work because the
// singleton above captured FakeAsyncLocalStorage while the global was absent.
const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external')

try {
  workAsyncStorage.run({}, () => {})
  console.log('ASYNC_LOCAL_STORAGE_AVAILABLE')
  process.exitCode = 0
} catch (error) {
  console.error(error && error.stack ? error.stack : error)
  process.exitCode = 73
}

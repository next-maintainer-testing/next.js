import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const originalGlobals = new Map()
let resultCode = 2

function installGlobal(name, value) {
  originalGlobals.set(name, Object.prototype.hasOwnProperty.call(globalThis, name)
    ? { present: true, value: globalThis[name] }
    : { present: false })
  globalThis[name] = value
}

function restoreGlobals() {
  for (const [name, original] of originalGlobals) {
    if (original.present) globalThis[name] = original.value
    else delete globalThis[name]
  }
}

try {
  const currentUrl = new URL('http://localhost/my-page/#my-subheading')
  const location = {
    protocol: currentUrl.protocol,
    hostname: currentUrl.hostname,
    port: currentUrl.port,
    origin: currentUrl.origin,
    href: currentUrl.href,
    pathname: currentUrl.pathname,
    search: currentUrl.search,
    hash: currentUrl.hash,
    reload() {}
  }
  const history = {
    scrollRestoration: 'auto',
    pushState() {},
    replaceState() {},
    back() {}
  }
  const windowObject = {
    __NEXT_DATA__: {
      props: {},
      page: '/my-page',
      query: {},
      buildId: 'verification',
      autoExport: false
    },
    location,
    history,
    next: {},
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {}
  }

  installGlobal('window', windowObject)
  installGlobal('self', windowObject)
  installGlobal('location', location)
  installGlobal('history', history)
  installGlobal('document', {
    documentElement: { lang: '' },
    getElementById() { return null },
    getElementsByName() { return [] }
  })

  const routerModule = require('next/router')
  const createRouter = routerModule.createRouter
  const publicRouter = routerModule.default
  if (typeof createRouter !== 'function' || !publicRouter) {
    throw new Error('next/router did not expose the Pages Router client API')
  }

  const asPathFromBrowser = `${location.pathname}${location.search}${location.hash}`
  createRouter('/my-page', {}, asPathFromBrowser, {
    initialProps: {},
    pageLoader: {},
    App() { return null },
    wrapApp() { return function AppTree() { return null } },
    Component() { return null },
    err: null,
    subscription() {},
    isFallback: false,
    isPreview: false
  })

  const observed = publicRouter.asPath
  const symptomPresent = typeof observed === 'string' && observed.includes('#my-subheading')
  console.log(JSON.stringify({
    inputUrl: currentUrl.href,
    routerAsPath: observed,
    symptomPresent
  }))
  resultCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error && error.stack ? error.stack : error)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  restoreGlobals()
}

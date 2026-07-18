import React, { forwardRef, memo } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import LinkModule from 'next/link.js'
import RouterContextModule from 'next/dist/shared/lib/router-context.shared-runtime.js'

const Link = LinkModule.default ?? LinkModule
const { RouterContext } = RouterContextModule

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.self = globalThis
globalThis.requestIdleCallback = (callback) =>
  setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0)
globalThis.cancelIdleCallback = (handle) => clearTimeout(handle)

let renderCount = 0

const MemoAnchor = memo(
  forwardRef(function MemoAnchor(props, ref) {
    renderCount += 1
    return React.createElement('a', { ...props, ref })
  }),
)

const baseRouter = {
  route: '/',
  pathname: '/',
  query: {},
  asPath: '/',
  basePath: '',
  locale: undefined,
  locales: undefined,
  defaultLocale: undefined,
  domainLocales: undefined,
  isLocaleDomain: false,
  isReady: true,
  isPreview: false,
  isFallback: false,
  push: async () => true,
  replace: async () => true,
  reload: () => {},
  back: () => {},
  forward: () => {},
  prefetch: async () => {},
  beforePopState: () => {},
  events: { on: () => {}, off: () => {}, emit: () => {} },
}

function tree(router) {
  return React.createElement(
    RouterContext.Provider,
    { value: router },
    React.createElement(
      Link,
      { href: '/destination', legacyBehavior: true, passHref: true },
      React.createElement(MemoAnchor, null, 'Destination'),
    ),
  )
}

let root

try {
  await act(async () => {
    root = TestRenderer.create(tree(baseRouter))
  })

  const rendersBeforeQueryChange = renderCount
  const routerAfterQueryChange = {
    ...baseRouter,
    query: { time: '1722973689000' },
    asPath: '/?time=1722973689000',
  }

  await act(async () => {
    root.update(tree(routerAfterQueryChange))
  })

  const extraRenders = renderCount - rendersBeforeQueryChange
  const symptomPresent = extraRenders > 0

  console.log(
    JSON.stringify({
      initialRenders: rendersBeforeQueryChange,
      extraRendersAfterQueryOnlyChange: extraRenders,
      symptomPresent,
    }),
  )

  process.exitCode = symptomPresent ? 0 : 1
  await act(async () => {
    root.unmount()
  })
} catch (error) {
  console.error(error?.stack ?? error)
  process.exitCode = 2
  if (root) {
    try {
      await act(async () => {
        root.unmount()
      })
    } catch {}
  }
}

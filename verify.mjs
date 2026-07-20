import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})

const installedGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLImageElement',
  'Event',
  'Node',
  'MutationObserver',
]

for (const name of installedGlobals) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: dom.window[name],
  })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let rootWithError
let rootWithoutError
let originalSrc

try {
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react-dom/test-utils')
  const imageModule = await import('next/image.js')
  const Image = imageModule.default?.default ?? imageModule.default

  originalSrc = Object.getOwnPropertyDescriptor(
    dom.window.HTMLImageElement.prototype,
    'src'
  )
  if (!originalSrc?.get || !originalSrc?.set) {
    throw new Error('Unable to instrument HTMLImageElement.src')
  }

  let selfAssignments = 0
  Object.defineProperty(dom.window.HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: originalSrc.enumerable,
    get: originalSrc.get,
    set(value) {
      if (originalSrc.get.call(this) === value) selfAssignments += 1
      originalSrc.set.call(this, value)
    },
  })

  async function rerenderSelfAssignments(withOnError) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    if (withOnError) rootWithError = root
    else rootWithoutError = root

    const renderImage = () =>
      React.createElement(Image, {
        alt: 'one pixel',
        src: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
        width: 1,
        height: 1,
        unoptimized: true,
        ...(withOnError ? { onError: () => {} } : {}),
      })

    await act(async () => root.render(renderImage()))
    selfAssignments = 0
    await act(async () => root.render(renderImage()))
    return selfAssignments
  }

  const withOnError = await rerenderSelfAssignments(true)
  const withoutOnError = await rerenderSelfAssignments(false)
  const symptomPresent = withOnError > 0 && withoutOnError === 0

  console.log(
    JSON.stringify({ withOnError, withoutOnError, symptomPresent })
  )
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  try {
    if (rootWithError || rootWithoutError) {
      const { act } = await import('react-dom/test-utils')
      await act(async () => {
        rootWithError?.unmount()
        rootWithoutError?.unmount()
      })
    }
  } catch (cleanupError) {
    console.error(cleanupError)
    process.exitCode = 2
  }
  if (originalSrc) {
    Object.defineProperty(
      dom.window.HTMLImageElement.prototype,
      'src',
      originalSrc
    )
  }
  dom.window.close()
}

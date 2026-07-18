import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let dom
let root

try {
  const { JSDOM } = require('jsdom')
  const React = require('react')
  const ReactDOMClient = require('react-dom/client')
  const { act } = require('react-dom/test-utils')
  const LinkModule = require('next/link')
  const Link = LinkModule.default || LinkModule

  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  })

  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  })
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Node = dom.window.Node
  globalThis.Event = dom.window.Event
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const container = document.getElementById('root')
  root = ReactDOMClient.createRoot(container)

  await act(async () => {
    root.render(
      React.createElement(
        Link,
        { href: '/about' },
        React.createElement(React.Fragment, null, 'About'),
      ),
    )
  })

  const anchor = container.querySelector('a[href="/about"]')
  const text = container.textContent.trim()
  const symptomPresent = anchor === null && text === 'About'

  console.log(JSON.stringify({
    symptom: 'Link with a Fragment child renders text without an anchor',
    symptomPresent,
    html: container.innerHTML,
  }))

  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  if (root) {
    try {
      await (require('react-dom/test-utils').act)(async () => {
        root.unmount()
      })
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError)
      if (process.exitCode === 0 || process.exitCode === 1) process.exitCode = 2
    }
  }
  if (dom) dom.window.close()
}

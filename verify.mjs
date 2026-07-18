import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/'
})

globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: dom.window.navigator
})
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.MouseEvent = dom.window.MouseEvent

let root
let settled = false
let timer

function finish(code, message) {
  if (settled) return
  settled = true
  process.exitCode = code
  clearTimeout(timer)
  console.log(message)
  if (root) root.unmount()
  dom.window.close()
}

process.on('unhandledRejection', (reason) => {
  const message = String(reason?.message ?? reason)
  const digest = String(reason?.digest ?? '')
  if (message.includes('NEXT_REDIRECT') || digest.startsWith('NEXT_REDIRECT;')) {
    finish(0, `Observed unhandled promise rejection: ${message}`)
  } else {
    finish(2, `Unexpected unhandled promise rejection: ${message}`)
  }
})

try {
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { RedirectAsyncButton } = await import('./app/redirect-async-button.js')

  root = createRoot(document.getElementById('root'))
  root.render(React.createElement(RedirectAsyncButton))

  await new Promise((resolve) => setTimeout(resolve, 50))
  const button = document.querySelector('button')
  if (!button) throw new Error('The reported button did not render')

  timer = setTimeout(() => {
    finish(1, 'No unhandled NEXT_REDIRECT promise rejection was observed')
  }, 1000)

  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
} catch (error) {
  finish(2, `Verification failed: ${error?.stack ?? error}`)
}

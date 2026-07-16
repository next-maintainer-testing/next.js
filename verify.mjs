import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/'
})

for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLFormElement',
  'HTMLButtonElement',
  'Event',
  'SubmitEvent',
  'FormData'
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: dom.window[key],
    writable: true
  })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root
try {
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const { act } = React
  const Form = require('next/form')
  const { RouterContext } = require(
    'next/dist/shared/lib/router-context.shared-runtime.js'
  )

  let navigatedTo = null
  const router = {
    push(href) {
      navigatedTo = href
      return Promise.resolve(true)
    },
    replace(href) {
      navigatedTo = href
      return Promise.resolve(true)
    },
    prefetch() {
      return Promise.resolve()
    }
  }

  root = createRoot(document.getElementById('root'))
  await act(async () => {
    root.render(
      React.createElement(
        RouterContext.Provider,
        { value: router },
        React.createElement(
          Form,
          { action: '/result' },
          React.createElement(
            'button',
            { type: 'submit', name: 'intent', value: 'next-form' },
            'Submit'
          )
        )
      )
    )
  })

  const form = document.querySelector('form')
  const button = document.querySelector('button')
  if (!form || !button) throw new Error('The form did not render')

  await act(async () => {
    form.dispatchEvent(
      new SubmitEvent('submit', {
        bubbles: true,
        cancelable: true,
        submitter: button
      })
    )
  })

  if (typeof navigatedTo !== 'string') {
    throw new Error('next/form did not perform client-side navigation')
  }

  const destination = new URL(navigatedTo, window.location.href)
  const submitterValue = destination.searchParams.get('intent')
  if (submitterValue === null) {
    console.log(`BUG REPRODUCED: navigation omitted submitter value (${destination.href})`)
    process.exitCode = 0
  } else if (submitterValue === 'next-form') {
    console.log(`BUG ABSENT: navigation included submitter value (${destination.href})`)
    process.exitCode = 1
  } else {
    throw new Error(`Unexpected submitter value: ${submitterValue}`)
  }
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  if (root) {
    await require('react').act(async () => root.unmount())
  }
  dom.window.close()
}

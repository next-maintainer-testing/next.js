import React from 'react'
import TestRenderer from 'react-test-renderer'
import { redirect } from 'next/navigation.js'

let caughtError = null
let renderer = null
const originalConsoleError = console.error

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    caughtError = error
  }

  render() {
    if (this.state.failed) {
      return React.createElement('p', { id: 'error-boundary-fallback' }, 'Error boundary caught redirect')
    }
    return this.props.children
  }
}

function RedirectingComponent() {
  redirect('/target')
  return React.createElement('p', null, 'redirect did not throw')
}

try {
  // React logs caught render errors to stderr even when an error boundary handles them.
  console.error = () => {}
  renderer = TestRenderer.create(
    React.createElement(
      ErrorBoundary,
      null,
      React.createElement(RedirectingComponent)
    )
  )

  const rendered = renderer.toJSON()
  const digest = caughtError?.digest ?? ''
  const fallbackRendered = rendered?.props?.id === 'error-boundary-fallback'
  const caughtRedirect = typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT;')
  const symptomPresent = fallbackRendered && caughtRedirect

  process.exitCode = symptomPresent ? 0 : 1
  console.log(JSON.stringify({
    symptomPresent,
    fallbackRendered,
    caughtRedirect,
    digest
  }))
} catch (error) {
  process.exitCode = 2
  console.error = originalConsoleError
  console.error('Verification failed:', error)
} finally {
  console.error = originalConsoleError
  if (renderer) renderer.unmount()
}

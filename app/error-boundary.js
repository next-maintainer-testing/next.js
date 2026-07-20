'use client'

import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return <p id="custom-boundary-fallback">Custom error boundary caught the error</p>
    }
    return this.props.children
  }
}

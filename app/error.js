'use client'

export default function ErrorBoundary({ reset }) {
  return (
    <main id="error-boundary" data-error-boundary="rendered">
      <h1>Nearest error.js boundary rendered</h1>
      <button onClick={reset}>Retry</button>
    </main>
  )
}

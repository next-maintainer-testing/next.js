'use client'

import { reportError } from '../lib/report-error'

export default function GlobalError({ error, reset }) {
  reportError(error)
  return (
    <html>
      <body>
        <button onClick={reset}>Retry</button>
      </body>
    </html>
  )
}

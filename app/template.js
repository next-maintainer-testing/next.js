'use client'

import { useEffect, useState } from 'react'

export default function Template({ children }) {
  const [mountNumber, setMountNumber] = useState(0)

  useEffect(() => {
    globalThis.__rootTemplateMounts = (globalThis.__rootTemplateMounts || 0) + 1
    setMountNumber(globalThis.__rootTemplateMounts)
  }, [])

  return (
    <main>
      <output data-testid="template-mount-number">{mountNumber}</output>
      {children}
    </main>
  )
}

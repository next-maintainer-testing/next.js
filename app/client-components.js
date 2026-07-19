'use client'

import { use, useEffect, useState } from 'react'
import { getValue } from './server-actions'

let cachedPromise

export function Demo() {
  // Mount Demo after hydration so this check isolates the reported client-side
  // Router update caused by calling the server action during Demo's render.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  cachedPromise ??= getValue()
  const value = use(cachedPromise)
  return <p data-testid="value">{value}</p>
}

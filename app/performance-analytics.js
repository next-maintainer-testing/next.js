'use client'

import { useEffect } from 'react'

// Minimal reconstruction of the unguarded observer in the nextjs.org client
// bundle served when issue #69467 was reported.
export default function ClientPerformanceAnalytics() {
  useEffect(() => {
    const observer = new PerformanceObserver(() => {})
    observer.observe({ type: 'event' })
    return () => observer.disconnect()
  }, [])

  return null
}

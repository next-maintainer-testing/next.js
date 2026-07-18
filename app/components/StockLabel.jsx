'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

export function StockLabel({ slug }) {
  const StockValue = dynamic(
    () => import('./StockValue').then((module) => module.StockValue),
    { ssr: false, loading: () => <p>Loading component...</p> }
  )

  return (
    <Suspense fallback={<p>Loading stock...</p>}>
      <StockValue slug={slug} />
    </Suspense>
  )
}

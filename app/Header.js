'use client'

import dynamic from 'next/dynamic'
import { useFilter } from './FilterProvider'

const DynamicContent = dynamic(
  async () => {
    if (typeof window !== 'undefined') {
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    return import('./DynamicContent')
  },
  {
    loading: () => <div id="dynamic-loading">Loading dynamic header</div>,
  }
)

export default function Header() {
  const { initialized } = useFilter()

  return (
    <header data-context-initialized={String(initialized)}>
      <DynamicContent />
    </header>
  )
}

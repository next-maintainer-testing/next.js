'use client'

import dynamic from 'next/dynamic'

const Child = dynamic(() => import('./child'))

export default function Page() {
  if (typeof window !== 'undefined') {
    window.__dynamicParentRenders = (window.__dynamicParentRenders || 0) + 1
  }
  console.log('dynamic-parent-render')
  return <main><h1>Dynamic import</h1><Child /></main>
}

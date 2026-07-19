'use client'

function Child() {
  return <p id="direct-child">Direct child loaded</p>
}

export default function Page() {
  if (typeof window !== 'undefined') {
    window.__directParentRenders = (window.__directParentRenders || 0) + 1
  }
  console.log('direct-parent-render')
  return <main><h1>Direct import baseline</h1><Child /></main>
}

import { Suspense } from 'react'

async function Slow() {
  await new Promise((resolve) => setTimeout(resolve, 10000))
  return <p>finished</p>
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return <main><h1>Abort reproduction</h1><Suspense fallback={<p>waiting</p>}><Slow /></Suspense></main>
}

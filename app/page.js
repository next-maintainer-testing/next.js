import { Suspense } from 'react'

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  await wait(2500)
  return {
    title: 'Delayed metadata',
    description: 'Issue 72935 reproduction',
  }
}

async function PageContent() {
  await wait(5000)
  return <h1 id="page-content">Page content</h1>
}

export default function Page() {
  return (
    <Suspense fallback={<div id="suspense-fallback">Loading page content</div>}>
      <PageContent />
    </Suspense>
  )
}

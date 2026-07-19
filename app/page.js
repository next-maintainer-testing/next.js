import { Suspense } from 'react'
import { Post } from './post'

export default function Page() {
  return (
    <main>
      <h1>Issue 51477</h1>
      <Suspense fallback={<p>Loading posts...</p>}>
        <Post />
      </Suspense>
    </main>
  )
}

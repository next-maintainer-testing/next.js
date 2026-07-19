import { Suspense } from 'react'
import ClientComponent from './client-component'

export default function Page({ searchParams }) {
  return (
    <Suspense>
      <ClientComponent searchParams={searchParams} />
    </Suspense>
  )
}

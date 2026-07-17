'use client'

import { useParams } from 'next/navigation'

export interface PageParams {
  storefront: string
  product: string
}

export function ClientComponent() {
  const params = useParams<PageParams>()
  return <div>{JSON.stringify(params)}</div>
}

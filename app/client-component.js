'use client'

import { use } from 'react'

export default function ClientComponent({ searchParams }) {
  return <pre>{JSON.stringify(use(searchParams), null, 2)}</pre>
}

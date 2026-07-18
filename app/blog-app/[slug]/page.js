'use client'

import { useParams } from 'next/navigation'

export default function Post() {
  const params = useParams()
  return <h1>Slug is {params?.slug}</h1>
}

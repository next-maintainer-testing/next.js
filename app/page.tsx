import type { Metadata } from 'next'

export const metadata = {
  title: 'My Website',
} satisfies Metadata

export default function Page() {
  return <main>{metadata.title}</main>
}

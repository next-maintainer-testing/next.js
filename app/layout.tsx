import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Issue 61180 reproduction' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html><body>{children}</body></html>
}

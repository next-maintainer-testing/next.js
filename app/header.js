'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Header() {
  const pathname = usePathname()
  globalThis.__issue78429HeaderRenders = (globalThis.__issue78429HeaderRenders || 0) + 1
  const renderNumber = globalThis.__issue78429HeaderRenders
  console.log('header', pathname, renderNumber)

  return (
    <header>
      <Link prefetch={false} href="/">Home</Link>{' '}
      <Link prefetch={false} href="/page23">Page23</Link>{' '}
      <Link prefetch={false} href="/page24">Page24</Link>
      <output data-header-render-count={renderNumber}>{renderNumber}</output>
    </header>
  )
}

import Link from 'next/link'
import Script from 'next/script'

export default function Page() {
  return (
    <main>
      <h1>Parent page</h1>
      <Link href="/child">Go to child page</Link>
      <Script data-id="home" />
    </main>
  )
}

export const revalidate = 0

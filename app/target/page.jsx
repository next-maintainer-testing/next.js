import Link from 'next/link'

export default function TargetPage() {
  return (
    <main data-page="target">
      <h1>Target</h1>
      <Link id="home-link" href="/" prefetch={false}>Return home</Link>
    </main>
  )
}

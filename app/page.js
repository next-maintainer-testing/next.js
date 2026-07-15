import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <Link href="/minutes">cacheLife(&quot;minutes&quot;)</Link>
      <br />
      <Link href="/seconds">cacheLife(&quot;seconds&quot;)</Link>
    </main>
  )
}

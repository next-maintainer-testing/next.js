import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>staleTimes reproduction</h1>
      <Link id="dynamic-link" href="/dynamic">Dynamic page</Link>
      <br />
      <Link id="static-link" href="/static">Static page</Link>
    </main>
  )
}

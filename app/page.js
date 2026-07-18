import Link from 'next/link'

export default function Home() {
  return (
    <main id="home-page">
      <h2>Home page</h2>
      <p><Link id="without-hash" href="/hoge">Without Hash</Link></p>
      <p><Link id="with-hash" href="/hoge#foo">With Missing Hash</Link></p>
    </main>
  )
}

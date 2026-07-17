import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <Link id="contact-link" href="/contact">Contact</Link>
    </main>
  )
}

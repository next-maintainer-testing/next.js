import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <Link id="about-link" href="#about">About</Link>
      <section id="about">About section</section>
    </main>
  )
}

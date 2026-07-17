import Link from 'next/link'

export default function Home() {
  return (
    <>
      <section className="hero">Page 1</section>
      <section className="content">
        <Link href="/page2">Go to Page 2</Link>
        <div className="spacer" />
        <Link href="/page2">Go to Page 2</Link>
      </section>
    </>
  )
}

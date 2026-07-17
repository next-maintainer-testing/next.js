import Link from 'next/link'

export default function Page2() {
  return (
    <>
      <section className="hero page2">Page 2</section>
      <section className="content">
        <Link href="/">Go to Page 1</Link>
        <div className="spacer" />
        <Link href="/">Go to Page 1</Link>
      </section>
    </>
  )
}

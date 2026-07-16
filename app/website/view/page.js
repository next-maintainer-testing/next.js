import Link from 'next/link'

export default function ViewPage() {
  return (
    <section>
      <h1>View</h1>
      <Link href="/website/edit">Go to edit</Link>
    </section>
  )
}

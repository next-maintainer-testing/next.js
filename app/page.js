import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Issue 91396 memory reproduction</h1>
      {Array.from({ length: 12 }, (_, id) => (
        <p key={id}><Link href={`/page/${id}`}>Page {id}</Link></p>
      ))}
    </main>
  )
}

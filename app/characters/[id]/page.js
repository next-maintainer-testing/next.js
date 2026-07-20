import Link from 'next/link'

export default function CharacterPage({ params }) {
  return (
    <main>
      <h1>Character {params.id}</h1>
      <Link href="/">Home</Link>
    </main>
  )
}

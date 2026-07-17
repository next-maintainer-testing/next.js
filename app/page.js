import Image from 'next/image'

export default function Home() {
  return (
    <main data-repro-marker="issue-61228">
      <h1>dev server is healthy</h1>
      <Image src="/next.svg" alt="Next.js" width={180} height={37} priority />
      <Image src="/vercel.svg" alt="Vercel" width={100} height={24} priority />
    </main>
  )
}

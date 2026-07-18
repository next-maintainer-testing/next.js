import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Blog</h1>
      <Link id="post-link" href="/blog/3" prefetch={true}>
        Go to post 3
      </Link>
    </main>
  )
}

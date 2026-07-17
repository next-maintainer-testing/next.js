import Link from 'next/link'

export default function Home() {
  return (
    <>
      <h1>Home</h1>
      <Link id="open-signin" href="/signin">Open signin</Link>
    </>
  )
}

import Link from 'next/link'
import './page2.css'

export default function Page2() {
  return (
    <main>
      <h1 id="page-2-title">Page 2</h1>
      <Link id="to-home" href="/">Home</Link>
    </main>
  )
}

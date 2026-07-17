import Link from 'next/link'

export default function SigninModal() {
  return (
    <aside id="signin-modal" role="dialog">
      <p>signin modal</p>
      <Link id="return-home" href="/">Return home</Link>
    </aside>
  )
}

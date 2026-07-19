import { redirect } from 'next/navigation'

export default function LoginPage() {
  async function submit() {
    'use server'
    redirect('/login')
  }

  return (
    <main>
      <h1 id="login-page">Login page</h1>
      <form action={submit}>
        <button id="submit" type="submit">Submit</button>
      </form>
    </main>
  )
}

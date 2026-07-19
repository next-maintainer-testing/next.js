import { redirect } from 'next/navigation'

export default function Page() {
  async function redirectAction() {
    'use server'
    redirect('/destination')
  }

  return (
    <main>
      <form action={redirectAction}>
        <button type="submit">Redirect</button>
      </form>
    </main>
  )
}

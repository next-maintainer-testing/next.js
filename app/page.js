import { redirect } from 'next/navigation'

export default function Page({ searchParams }) {
  async function redirectFromAction() {
    'use server'
    redirect('/?hello=xyz')
  }

  return (
    <main>
      <form action={redirectFromAction}>
        <button id="trigger" type="submit">Trigger A redirect</button>
      </form>
      <output id="params">{JSON.stringify(searchParams)}</output>
    </main>
  )
}

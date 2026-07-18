import { ping } from './actions'

export default function Page() {
  return (
    <main>
      <h1>Server Action middleware reproduction</h1>
      <form action={ping}><button type="submit">Ping</button></form>
    </main>
  )
}

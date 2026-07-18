import { headers } from 'next/headers'

export default function Page() {
  const nonce = headers().get('x-nonce')
  return <main data-nonce={nonce || ''}>strict CSP example</main>
}

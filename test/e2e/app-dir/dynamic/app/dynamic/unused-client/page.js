import dynamic from 'next/dynamic'

const UnusedClient = dynamic(() => import('./client'))
void UnusedClient

export default function Page() {
  return <p>Page without the dynamic component</p>
}

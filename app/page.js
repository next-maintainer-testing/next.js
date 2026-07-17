import crypto from 'node:crypto'
import NavigationButton from './navigation-button'

export const dynamic = 'force-dynamic'

export default function Home() {
  const value = crypto.randomUUID()
  return (
    <main>
      <h1>Home</h1>
      <p data-testid="fresh-value">{value}</p>
      <NavigationButton href="/test">Go to test</NavigationButton>
    </main>
  )
}

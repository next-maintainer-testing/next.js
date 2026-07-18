import { getGlobalState } from '../lib/global-state'

export const dynamic = 'force-dynamic'

export default function Page() {
  const state = getGlobalState()

  return (
    <main>
      <h1>Next.js issue 52165 reproduction</h1>
      <p>Global value before initialization: {state.previous}</p>
      <p>Global value after initialization: {state.current}</p>
    </main>
  )
}

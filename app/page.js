import NavigationProbe from '../components/navigation-probe'

export const runtime = 'edge'

export default function Page() {
  return (
    <main>
      <h1>Edge runtime useRouter reproduction</h1>
      <NavigationProbe />
    </main>
  )
}

import { serverFunction } from '../lib/action'

export default async function Home() {
  const count = await serverFunction()
  return <main>Home count: {count}</main>
}

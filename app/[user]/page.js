import { serverFunction } from '../../lib/action'

export default async function UserPage({ params }) {
  const { user } = await params
  const count = await serverFunction()
  return <main>User {user} count: {count}</main>
}

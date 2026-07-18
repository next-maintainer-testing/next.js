const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default async function UsersPage() {
  await delay(3000)
  return <article style={{ border: '1px solid #999', padding: 20 }}><h2>Users</h2><p>User data has loaded.</p></article>
}

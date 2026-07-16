export default function UserPage({ params }: { params: { username: string } }) {
  return <main>User: {params.username}</main>
}

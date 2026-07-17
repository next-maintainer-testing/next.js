import { connection } from 'next/server'

export default async function DynamicPage() {
  await connection()
  return <main><h1>Dynamic page</h1><p>{Date.now()}</p></main>
}

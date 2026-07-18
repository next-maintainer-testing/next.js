import { redirect } from 'next/navigation'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function generateMetadata() {
  await wait(100)
  redirect('/generate-metadata-redirect')
}

export default async function Page() {
  await wait(200)
  return <main>Page rendered before metadata redirect resolved</main>
}

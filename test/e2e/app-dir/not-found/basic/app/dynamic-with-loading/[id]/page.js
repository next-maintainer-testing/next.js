import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Page(props) {
  const params = await props.params

  if (params.id !== 'real') {
    notFound()
  }

  return <h1 id="page">ok</h1>
}

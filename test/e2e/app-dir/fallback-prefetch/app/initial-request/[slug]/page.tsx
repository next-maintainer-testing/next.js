export const dynamic = 'force-static'
export const revalidate = 30

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await new Promise((resolve) => setTimeout(resolve, 2_000))
  const { slug } = await params

  return <div>Initial page, slug: {slug}</div>
}

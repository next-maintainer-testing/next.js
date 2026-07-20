const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export default async function ArtPage({ params }) {
  await wait(4000)
  const { artist, art } = await params
  return <p data-page="art">{artist}: {art}</p>
}

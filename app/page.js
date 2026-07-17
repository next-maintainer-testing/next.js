const imageUrl =
  'https://picsum.photos/id/870/200/300?grayscale=1&blur=2'

export default function Page() {
  return (
    <main>
      <h1>Image query parameter reproduction</h1>
      <img alt="query parameter reproduction" src={imageUrl} />
    </main>
  )
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default async function ArchivedChildrenPage() {
  await delay(1200)
  return <p data-view="archived-page">Archived revenue details loaded after its delayed fetch.</p>
}

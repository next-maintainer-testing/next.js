export default async function Page24() {
  await new Promise((resolve) => setTimeout(resolve, 100))
  return <h1>Page24 (async)</h1>
}

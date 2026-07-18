export default async function Page23() {
  await new Promise((resolve) => setTimeout(resolve, 100))
  return <h1>Page23 (async)</h1>
}

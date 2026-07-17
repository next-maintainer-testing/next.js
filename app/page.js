const revision = 'base'

export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 100))
  return <main><h1>HMR favicon check</h1><p id="revision">{revision}</p></main>
}

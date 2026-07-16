export const revalidate = 0

export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 250))
  return <main id="resolved-content">Dynamic page loaded without JavaScript</main>
}

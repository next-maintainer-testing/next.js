async function getData() {
  const response = await fetch(
    "data:application/json,%7B%22message%22%3A%22tagged-data%22%7D",
    {
      cache: "force-cache",
      next: { tags: ["my-data-tag", "home-page"] },
    },
  )
  return response.json()
}

export default async function Home() {
  const data = await getData()
  return <main>{data.message}</main>
}

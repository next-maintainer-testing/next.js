export default async function SomePage() {
  const response = await fetch('data:application/json,%7B%22message%22%3A%22hello%22%7D', {
    cache: 'no-store',
  })
  const data = await response.json()

  return <main>{data.message}</main>
}

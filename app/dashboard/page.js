const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default async function DashboardPage() {
  await delay(4000)
  return <p data-view="dashboard">Dashboard overview loaded after its delayed fetch.</p>
}

export default async function DashboardPage({ params }) {
  const { slug } = await params;
  return (
    <main>
      <h1>Dashboard: {slug}</h1>
      <p>Welcome to the {slug} dashboard!</p>
    </main>
  );
}

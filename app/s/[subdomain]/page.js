export const dynamic = 'force-static';
export const revalidate = 1000;

export default async function SubdomainPage({ params }) {
  const { subdomain } = await params;
  const response = await fetch(process.env.DATA_URL, { cache: 'no-store' });
  const data = await response.json();
  return (
    <main>
      <h1>{subdomain}</h1>
      <p>Data request: {data.request}</p>
    </main>
  );
}

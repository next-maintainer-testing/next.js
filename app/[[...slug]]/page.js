export default async function Home({ params }) {
  const { slug } = await params;
  return <main>Issue 80050 page rendered: {slug?.join('/') ?? 'frontpage'}</main>;
}

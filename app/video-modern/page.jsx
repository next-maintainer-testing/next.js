export default async function VideoModernPage({ searchParams }) {
  const params = await searchParams;
  const sourcePage = params?.sourcePage ?? "MISSING";

  return (
    <main>
      <h1>Modern video</h1>
      <p id="observed-search-param">{sourcePage}</p>
    </main>
  );
}

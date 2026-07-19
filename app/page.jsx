import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>App Router masked-query navigation</h1>
      <Link
        id="masked-query-link"
        href="/video-modern?sourcePage=HomePage&sourceElement=featuredVideo"
        as="/video-modern"
      >
        Watch the featured video
      </Link>
    </main>
  );
}

import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1 id="home-page">Home</h1>
      <Link id="slow-link" href="/slow" prefetch={false}>
        Open slow route
      </Link>
    </main>
  );
}

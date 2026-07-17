import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Static page</h1>
      <Link id="dynamic-link" href="/dynamic" prefetch={false}>
        Open dynamic page
      </Link>
    </main>
  );
}

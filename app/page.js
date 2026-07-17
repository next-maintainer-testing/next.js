import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Intercepting route with PPR</h1>
      <Link id="open-command" href="/command">Open command palette</Link>
    </main>
  );
}

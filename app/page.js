import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>Home</h1>
      <Link id="about-link" href="/about">Go to About Page</Link>
    </main>
  );
}

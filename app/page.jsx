import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <Link href="/suspense-test" prefetch={false}>
        Suspense test
      </Link>
    </main>
  );
}

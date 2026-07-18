'use client';

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  return (
    <main>
      <h1>Home</h1>
      <button onClick={() => router.push('/abc#FragmentDynamic')}>Go to other Page</button>
    </main>
  );
}

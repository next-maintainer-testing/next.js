'use client';

import { useRouter } from 'next/navigation';

export default function AbcPage() {
  const router = useRouter();
  return (
    <main>
      <h1>Dynamic Page here</h1>
      <button onClick={() => router.push('/#FragmentHome')}>Go home</button>
      <button onClick={() => router.push('/abc#DifferentFragment')}>Change fragment</button>
    </main>
  );
}

import Link from 'next/link';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';

export default async function PageA() {
  await cookies();
  const renderId = randomUUID();

  return (
    <main>
      <h1>Route A</h1>
      <output data-testid="render-id">{renderId}</output>
      <p><Link href="/b" data-testid="to-b">Route B</Link></p>
    </main>
  );
}

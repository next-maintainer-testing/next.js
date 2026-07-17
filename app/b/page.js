import Link from 'next/link';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { doNothing, invalidateUnrelatedTag } from './actions';

export default async function PageB() {
  await cookies();
  const renderId = randomUUID();

  return (
    <main>
      <h1>Route B</h1>
      <output data-testid="render-id">{renderId}</output>
      <form action={doNothing}>
        <button type="submit" data-testid="noop">Run no-op action</button>
      </form>
      <form action={invalidateUnrelatedTag}>
        <button type="submit" data-testid="invalidate">Invalidate unrelated tag</button>
      </form>
      <p><Link href="/a" prefetch={true} data-testid="to-a">Route A</Link></p>
    </main>
  );
}

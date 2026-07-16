import { Suspense } from 'react';

export const dynamic = 'force-static';
export const dynamicParams = true;
export const revalidate = 20;

export default async function SuspensePage({ params }) {
  const { slug } = await params;

  return (
    <main>
      <h1>This is static content</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <LongRunning slug={slug} />
      </Suspense>
    </main>
  );
}

async function LongRunning({ slug }) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  return <p>Success! ({slug})</p>;
}

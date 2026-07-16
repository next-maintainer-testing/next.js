import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

async function DynamicHole() {
  const cookieStore = await cookies();
  return (
    <p data-dynamic="ready">
      Dynamic value: {cookieStore.get('value')?.value ?? 'none'}
    </p>
  );
}

export default async function BlogPost({ params }) {
  const { slug } = await params;
  if (slug !== 'known') notFound();

  return (
    <main data-page="known">
      <h1>Known blog post</h1>
      <Suspense fallback={<p data-dynamic="loading">Loading dynamic value</p>}>
        <DynamicHole />
      </Suspense>
    </main>
  );
}

export function generateStaticParams() {
  return [{ slug: 'known' }];
}

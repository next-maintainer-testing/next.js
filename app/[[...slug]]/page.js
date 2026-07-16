import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export default async function Home({ params }) {
  const { slug } = params;

  if (slug) {
    notFound();
  }

  return (
    <div>
      <h1>{slug ? slug : 'home page'}</h1>
      <ol>
        <li><Link href="/">Home Page</Link></li>
        <li><Link href="/article">Article Not Found</Link></li>
      </ol>
    </div>
  );
}

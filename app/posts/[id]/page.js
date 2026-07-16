import { notFound } from 'next/navigation';

export const revalidate = 1;

export function generateStaticParams() {
  return [];
}

export default async function PostPage({ params }) {
  const { id } = await params;
  const response = await fetch(`${process.env.BACKEND_ORIGIN}/posts/${id}`);

  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    throw new Error(`backend returned ${response.status}`);
  }

  const post = await response.json();
  return <main data-post-id={id}>{`PUBLISHED_POST_${post.id}`}</main>;
}

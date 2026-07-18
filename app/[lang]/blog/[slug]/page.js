export function generateStaticParams() {
  return [{ lang: 'en', slug: 'test-1' }]
}

export default function BlogPost({ params }) {
  return <main>{params.lang}/{params.slug}</main>
}

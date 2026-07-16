export const runtime = 'edge';

export async function generateSitemaps() {
  return [{ id: 0 }];
}

export default async function sitemap({ id }) {
  await id;
  return [
    {
      url: 'https://example.com/',
      lastModified: new Date('2025-01-22T00:00:00.000Z'),
    },
  ];
}

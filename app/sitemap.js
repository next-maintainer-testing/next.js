export const revalidate = 3600

export default function sitemap() {
  return [
    {
      url: 'https://example.com',
      lastModified: new Date('2024-01-01T00:00:00.000Z'),
    },
  ]
}

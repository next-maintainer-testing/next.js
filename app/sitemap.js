export default async function sitemap() {
  return [
    {
      url: 'http://localhost:3000/',
      lastModified: new Date('2023-11-30T00:00:00.000Z'),
      changeFrequency: 'yearly',
      priority: 1,
    },
  ]
}

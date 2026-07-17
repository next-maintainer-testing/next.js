export async function generateSitemaps() {
  return [{ id: 0 }]
}

export default async function sitemap({ id }) {
  await id

  return [
    {
      url: 'https://example.com/pathname/1',
      alternates: {
        media: {
          'only screen and (max-width: 640px)':
            'https://m.example.com/pathname/1',
        },
      },
    },
  ]
}

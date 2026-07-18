import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: 'https://example.com' }]
}

// export async function generateSitemaps() {
//   return [{ id: 0 }]
// }

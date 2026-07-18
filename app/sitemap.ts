import type { MetadataRoute } from 'next'

export async function generateSitemaps() {
  return [{ id: 1 }]
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://example.com/video',
      lastModified: new Date('2025-06-12T00:00:00.000Z'),
      videos: [
        {
          title: 'MD0186 肉【钟宛冰&苏语棠】',
          thumbnail_loc: 'https://example.com/thumbnail.jpg',
          description: 'Video description',
          content_loc: 'https://example.com/video.mp4',
        },
      ],
    },
  ]
}

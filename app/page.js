import { Box, Typography } from '@mui/material'

export const dynamic = 'force-dynamic'

const sectionNames = Array.from({ length: 19 }, (_, index) => `Section ${index + 1}`)
const articles = Array.from({ length: 25 }, (_, index) => ({
  id: index,
  title: `A representative article title containing enough text for the large server-rendered page ${index + 1}`,
  image: `https://example.com/article-${index + 1}.jpg`,
}))

export default function Page() {
  return (
    <Box>
      {sectionNames.map((section) => (
        <Box className="mb-12" key={section}>
          <Typography variant="h4" className="py-4">{section}</Typography>
          <Box className="flex flex-row flex-wrap gap-2">
            {articles.map((article) => (
              <a className="h-[250px] w-[300px] no-underline" href={`/${section}/${article.id}`} key={article.id}>
                <Box className="h-full shadow-sm hover:shadow-lg">
                  <img
                    loading="lazy"
                    src={article.image}
                    alt={article.title}
                    sizes="100vw"
                    width="0"
                    height="0"
                    className="h-auto max-h-40 w-full"
                  />
                  <Typography variant="h6" fontWeight={600}>{article.title}</Typography>
                </Box>
              </a>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

import { serialize } from 'next-mdx-remote/serialize'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypePrettyCode from 'rehype-pretty-code'

export const dynamic = 'force-dynamic'

const options = {
  theme: 'one-dark-pro',
}

export async function GET() {
  const result = await serialize('# Example\n\n```js\nconsole.log("hello")\n```', {
    mdxOptions: {
      remarkPlugins: [remarkGfm],
      rehypePlugins: [
        rehypeSlug,
        [rehypePrettyCode, options],
        [rehypeAutolinkHeadings, { properties: { className: ['anchor'] } }],
      ],
      format: 'mdx',
    },
  })

  return Response.json({ compiledSource: result.compiledSource })
}

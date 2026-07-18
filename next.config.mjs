import createMDX from '@next/mdx'

const withMDX = createMDX()

export default withMDX({
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
})

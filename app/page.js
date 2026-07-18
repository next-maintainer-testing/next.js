const DOC_PATHS = [
  'docs/01-app/03-building-your-application/09-authentication/index.mdx',
  'docs/01-app/02-building-your-application/09-authentication/index.mdx',
  'docs/01-app/02-guides/authentication.mdx',
]

async function loadAuthenticationDoc(version) {
  for (const path of DOC_PATHS) {
    const url = `https://raw.githubusercontent.com/vercel/next.js/v${version}/${path}`
    const response = await fetch(url, { cache: 'no-store' })
    if (response.ok) return { path, source: await response.text() }
    if (response.status !== 404) {
      throw new Error(`Unable to fetch ${url}: HTTP ${response.status}`)
    }
  }
  throw new Error(`Authentication documentation was not found for Next.js ${version}`)
}

export default async function Page() {
  const version = require('next/package.json').version
  const { path, source } = await loadAuthenticationDoc(version)
  const staleHook = 'useFormState'
  const currentHook = 'useActionState'
  const staleIndex = source.indexOf(staleHook)
  const currentCount = source.split(currentHook).length - 1
  const excerpt = staleIndex === -1
    ? `No ${staleHook} reference is present; ${currentHook} occurs ${currentCount} time(s).`
    : source.slice(Math.max(0, staleIndex - 100), staleIndex + staleHook.length + 100)

  return (
    <main>
      <h1>Next.js authentication documentation hook check</h1>
      <p>Next.js version: <code>{version}</code></p>
      <p>Documentation source: <code>{path}</code></p>
      <p data-reported-hook={staleIndex === -1 ? 'absent' : staleHook}>{excerpt}</p>
    </main>
  )
}

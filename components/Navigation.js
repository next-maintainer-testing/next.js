import Link from 'next/link'
import Script from 'next/script'

export default function Navigation({ prefix }) {
  const withId = `window.__scriptRuns = window.__scriptRuns || {}; window.__scriptRuns['${prefix}-with-id'] = (window.__scriptRuns['${prefix}-with-id'] || 0) + 1;`
  const withoutId = `window.__scriptRuns = window.__scriptRuns || {}; window.__scriptRuns['${prefix}-without-id'] = (window.__scriptRuns['${prefix}-without-id'] || 0) + 1;`

  return (
    <nav>
      <Script
        strategy="afterInteractive"
        id={`${prefix}-inline-script`}
        dangerouslySetInnerHTML={{ __html: withId }}
      />
      <Script
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: withoutId }}
      />
      <Link href="/">Home</Link>{' | '}
      <Link href="/other">Other page</Link>
    </nav>
  )
}

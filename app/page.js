import Link from 'next/link'

export default function DocumentationPage() {
  return (
    <main>
      <header style={{ height: 1800, padding: 24, boxSizing: 'border-box', background: '#eee' }}>
        Documentation content before the Request Memoization section
      </header>
      <section id="request-memoization" style={{ minHeight: 900, padding: 24 }}>
        <h1>Request Memoization</h1>
        <p>This section starts below a long documentation page.</p>
        <Link id="fetch-link" href="/fetching">Fetch API</Link>
      </section>
    </main>
  )
}

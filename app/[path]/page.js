import Link from 'next/link'

export default function Page({ params }) {
  const destination = params.path === 'one' ? 'two' : 'one'

  return (
    <>
      <nav
        data-testid="sticky-nav"
        style={{
          position: 'sticky',
          top: 0,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '0 24px',
          background: '#fff',
          borderBottom: '1px solid #ccc',
          zIndex: 1,
        }}
      >
        <strong>Current page: {params.path}</strong>
        <Link id="dynamic-link" href={`/${destination}`}>
          Go to {destination}
        </Link>
      </nav>
      <main style={{ minHeight: 3200, padding: 24 }}>
        <h1>Dynamic route {params.path}</h1>
        <p>Scroll down, then use the sticky navigation link.</p>
      </main>
    </>
  )
}

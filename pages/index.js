export default function Home() {
  // The hydration mismatch is caused by this browser-only read during render.
  const showExtra = typeof window !== 'undefined' && window.localStorage.getItem('show-extra') === 'yes'

  return (
    <main>
      <div id="stable">stable content</div>
      {showExtra ? <div id="client-only">client-only content</div> : null}
    </main>
  )
}

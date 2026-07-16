import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>Hash-link keyboard focus reproduction</h1>
      <nav aria-label="Section navigation">
        <ul>
          <li><a id="native-link" href="#native-target">Native anchor target</a></li>
          <li><Link id="next-link" href="#next-target">Next Link target</Link></li>
          <li><a id="after-next" href="#after-target">Navigation item after Next Link</a></li>
        </ul>
      </nav>

      <div style={{ height: '800px' }} aria-hidden="true" />

      <section>
        <h2 id="native-target">Native anchor section</h2>
        <a id="native-destination-action" href="#native-done">First action after native target</a>
      </section>

      <div style={{ height: '800px' }} aria-hidden="true" />

      <section>
        <h2 id="next-target">Next Link section</h2>
        <a id="next-destination-action" href="#next-done">First action after Next Link target</a>
      </section>

      <h2 id="after-target">Final section</h2>
      <div id="native-done" />
      <div id="next-done" />
    </main>
  )
}

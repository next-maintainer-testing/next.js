import Counter from './counter'

export default function Page() {
  return (
    <main>
      <Counter />
      <a id="navigate" href="/target-page">Navigate with a document request</a>
    </main>
  )
}

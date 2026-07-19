export default function Article() {
  return (
    <main>
      <h1>Article deployment {process.env.BUILD_MARKER}</h1>
    </main>
  )
}

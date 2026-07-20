import ClientComponent from './client-component'

export default function Page() {
  return (
    <main>
      <section data-fiber-kind="server">Rendered by the server component</section>
      <ClientComponent />
    </main>
  )
}

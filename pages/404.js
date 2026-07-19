export default function Custom404() {
  return <main id="locale">404 locale: unknown</main>
}

export async function getStaticProps(context) {
  return { props: { locale: context.locale || null } }
}

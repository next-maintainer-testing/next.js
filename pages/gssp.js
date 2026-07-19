export async function getServerSideProps() {
  return { props: { ok: true } }
}

export default function GsspPage({ ok }) {
  return <main>{ok ? 'ok' : 'not ok'}</main>
}

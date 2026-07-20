import fs from 'node:fs'
import path from 'node:path'

export async function getStaticProps() {
  const selected = process.env.TRACE_FIXTURE_FILE || 'file-00000.txt'
  const value = fs.readFileSync(path.join(process.cwd(), 'trace-fixture', selected), 'utf8')
  return { props: { value: value.slice(0, 16) } }
}

export default function Home({ value }) {
  return <main>Tracing fixture: {value}</main>
}

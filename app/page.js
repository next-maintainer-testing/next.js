import { writeFileSync } from 'node:fs'

async function readDatabase() {
  'use cache'

  if (process.env.DB_PROBE_FILE) {
    writeFileSync(process.env.DB_PROBE_FILE, 'database query executed\n')
  }

  return 'database result'
}

export default async function Page() {
  const result = await readDatabase()
  return <main>{result}</main>
}

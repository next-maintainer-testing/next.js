import { readFile } from 'node:fs/promises'
import Link from 'next/link'
import Form from '../../components/Form'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DynamicPage() {
  const data = JSON.parse(await readFile('./data.json', 'utf8'))
  return <><Form data={data} /><Link href="/">Home</Link></>
}

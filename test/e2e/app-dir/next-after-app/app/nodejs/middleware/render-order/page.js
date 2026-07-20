import { cliLog } from '../../../../utils/log'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }) {
  const { requestId } = await searchParams
  cliLog({ source: '[page] /middleware/render-order', requestId })
  return <div>Middleware after render order</div>
}

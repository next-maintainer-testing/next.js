import { cache } from 'react'
import { GraphQLClient } from 'graphql-request'

export const dynamic = 'force-dynamic'

const cachedFetch = cache(async (url, init) => fetch(url, { ...init, cache: 'no-store' }))
const client = new GraphQLClient(process.env.GRAPHQL_URL, { fetch: cachedFetch })
const query = /* GraphQL */ `query Value { value }`

export default async function Page() {
  await client.request(query)
  await client.request(query)

  return <main id="result">Both identical GraphQL requests completed</main>
}

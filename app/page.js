async function cachedMiddleware(options) {
  'use cache'
  return options.next(options)
}

export default async function Page() {
  const ctx = Object.create(null)
  const options = {
    ctx,
    type: 'query',
    path: 'user.getByEmail',
    rawInput: 'issue-73094@example.com',
    input: 'issue-73094@example.com',
    next: async ({ rawInput }) => rawInput,
  }
  const email = await cachedMiddleware(options)
  return <main id="success">cache-result:{email}</main>
}

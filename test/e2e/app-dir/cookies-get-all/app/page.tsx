import { cookies, headers } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const sessionCookiesFromAll = cookieStore
    .getAll()
    .filter((cookie) => cookie.name === 'sessionid')
  const matchingSessionCookies = cookieStore.getAll('sessionid')

  return (
    <main>
      <pre id="cookie-header">{(await headers()).get('cookie')}</pre>
      <pre id="all-session-cookies">
        {JSON.stringify(sessionCookiesFromAll)}
      </pre>
      <pre id="matching-session-cookies">
        {JSON.stringify(matchingSessionCookies)}
      </pre>
    </main>
  )
}

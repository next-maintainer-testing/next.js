import { nextTestSetup } from 'e2e-utils'

const cookieHeader = 'sessionid=a; sessionid=b'
const expectedSessionCookies = [
  { name: 'sessionid', value: 'a' },
  { name: 'sessionid', value: 'b' },
]

describe('cookies-get-all', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('preserves duplicate same-name cookies from the request header', async () => {
    const $ = await next.render$(
      '/',
      {},
      {
        headers: {
          Cookie: cookieHeader,
        },
      }
    )

    expect({
      cookieHeader: $('#cookie-header').text(),
      allSessionCookies: JSON.parse($('#all-session-cookies').text()),
      matchingSessionCookies: JSON.parse($('#matching-session-cookies').text()),
    }).toEqual({
      cookieHeader,
      allSessionCookies: expectedSessionCookies,
      matchingSessionCookies: expectedSessionCookies,
    })
  })
})

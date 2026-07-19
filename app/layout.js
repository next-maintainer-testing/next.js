import './globals.css'

async function fakeRequest() {
  console.log('ISSUE_66418_FAKE_REQUEST')
  const response = await fetch(process.env.PROBE_URL)
  if (!response.ok) throw new Error('probe request failed')
  return response.json()
}

export default async function RootLayout({ children, authModal }) {
  await fakeRequest()
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        {authModal}
      </body>
    </html>
  )
}

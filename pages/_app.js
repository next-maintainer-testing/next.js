import createCache from '@emotion/cache'
import { CacheProvider, Global, css } from '@emotion/react'

const cache = createCache({ key: 'next' })
const globalStyles = css`
  html, body {
    margin: 0;
    background: rgb(255, 239, 213);
    font-family: Arial, sans-serif;
  }
`

export default function App({ Component, pageProps }) {
  return (
    <CacheProvider value={cache}>
      <Global styles={globalStyles} />
      <Component {...pageProps} />
    </CacheProvider>
  )
}

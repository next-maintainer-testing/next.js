import Document, { Head, Html, Main, NextScript } from 'next/document'
import Script from 'next/script'

export default class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
          <Script id="id-1" strategy="beforeInteractive" src="https://example.com/one.js" />
          <Script id="id-2" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: 'console.log("two")' }} />
          <Script id="id-3" strategy="beforeInteractive" src="https://example.com/three.js" />
          <Script id="id-4" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: 'console.log("four")' }} />
        </body>
      </Html>
    )
  }
}

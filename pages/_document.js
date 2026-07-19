import Document, { Head, Html, Main, NextScript } from 'next/document'
import Script from 'next/script'

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const originalRenderPage = ctx.renderPage
    ctx.renderPage = () => originalRenderPage({
      enhanceApp: (App) => (props) => <App {...props} />,
    })
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps, styles: <>{initialProps.styles}</> }
  }

  render() {
    return (
      <Html>
        <Head>
          <Script src="/vendor/react.production.min.js" defer strategy="beforeInteractive" />
          <Script src="/vendor/react-dom.production.min.js" defer strategy="beforeInteractive" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument

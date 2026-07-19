import Document, { Head, Html, Main, NextScript } from 'next/document';
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import '@ant-design/v5-patch-for-react-19';

export default class AppDocument extends Document {
  static async getInitialProps(ctx) {
    const cache = createCache();
    const originalRenderPage = ctx.renderPage;
    ctx.renderPage = () => originalRenderPage({
      enhanceApp: (App) => (props) => (
        <StyleProvider cache={cache}>
          <App {...props} />
        </StyleProvider>
      ),
    });
    const initialProps = await Document.getInitialProps(ctx);
    const style = extractStyle(cache, true);
    return {
      ...initialProps,
      styles: (
        <>
          {initialProps.styles}
          <style dangerouslySetInnerHTML={{ __html: style }} />
        </>
      ),
    };
  }

  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

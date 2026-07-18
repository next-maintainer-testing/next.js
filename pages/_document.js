import Document, { Html, Head, Main, NextScript } from 'next/document';
import { StyleProvider, createCache } from '@ant-design/cssinjs';
import { doExtraStyle } from '../scripts/genAntdCss';

export default function MyDocument() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

MyDocument.getInitialProps = async (ctx) => {
  const cache = createCache();
  const originalRenderPage = ctx.renderPage;
  ctx.renderPage = () =>
    originalRenderPage({
      enhanceApp: (App) => (props) => (
        <StyleProvider cache={cache}>
          <App {...props} />
        </StyleProvider>
      ),
    });

  const initialProps = await Document.getInitialProps(ctx);
  const fileName = doExtraStyle({ cache });
  return {
    ...initialProps,
    styles: (
      <>
        {initialProps.styles}
        {fileName && <link rel="stylesheet" href={`/${fileName}`} />}
      </>
    ),
  };
};

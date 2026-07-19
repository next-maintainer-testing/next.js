import { App as AntdApp, ConfigProvider } from 'antd';

export default function App({ Component, pageProps }) {
  return (
    <ConfigProvider>
      <AntdApp>
        <Component {...pageProps} />
      </AntdApp>
    </ConfigProvider>
  );
}

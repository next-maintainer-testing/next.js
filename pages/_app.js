import Link from 'next/link';

export default function App({ Component, pageProps }) {
  return (
    <>
      <nav>
        <Link href="/">home</Link>{' '}
        <Link href="/a">a</Link>{' '}
        <Link href="/b">b</Link>
      </nav>
      <Component {...pageProps} />
    </>
  );
}

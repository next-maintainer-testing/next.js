import Head from 'next/head'

export default function Home() {
  return <>
    <Head><link rel="stylesheet" href="/tailwind.css" /></Head>
    <main data-page="protected">Protected page</main>
  </>
}

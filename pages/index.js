import Image from 'next/image'

export default function Home() {
  return (
    <main>
      <h1>Frozen image configuration</h1>
      <Image src="/test.svg" alt="test" width={100} height={100} quality={85} />
    </main>
  )
}

export async function getServerSideProps() {
  return { props: {} }
}

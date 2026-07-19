import { useRouter } from 'next/router'

export default function CatchAllPage({ serverAsPath }) {
  const router = useRouter()

  return (
    <main>
      <p id="server-as-path">{serverAsPath}</p>
      <p id="router-as-path">{router.asPath}</p>
    </main>
  )
}

CatchAllPage.getInitialProps = ({ asPath }) => ({ serverAsPath: asPath })

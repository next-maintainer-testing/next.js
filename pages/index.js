export function getStaticProps() {
  return { props: { nodeEnv: process.env.NODE_ENV } }
}

export default function Home({ nodeEnv }) {
  return <main id="node-env">{nodeEnv}</main>
}

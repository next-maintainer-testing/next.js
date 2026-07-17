export default function Page() {
  return <>
    <style href="foo" precedence="bar" nonce="12345">{`
      body { background: red; }
    `}</style>
    <main>nonce reproduction</main>
  </>;
}

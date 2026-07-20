export default async function Page() {
  const { HelloWorld } = await import('../../components/hello-world')
  return <HelloWorld />
}

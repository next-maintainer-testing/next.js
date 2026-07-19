export default function Page() {
  const button = (
    <form action={foo}>
      <button type="submit">Use value</button>
    </form>
  )
  const value = 2
  return button

  async function foo() {
    'use server'
    console.log(value)
  }
}

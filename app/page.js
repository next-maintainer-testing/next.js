'use client'

import Form from 'next/form'

export default function Page() {
  return (
    <main>
      <Form action="/result">
        <button type="submit" name="intent" value="next-form">Submit next/form</button>
      </Form>
      <form action="/result">
        <button type="submit" name="intent" value="html-form">Submit HTML form</button>
      </form>
    </main>
  )
}

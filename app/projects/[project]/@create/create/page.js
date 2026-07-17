import { redirect } from 'next/navigation'

export default function CreateModal() {
  async function submit() {
    'use server'
    redirect('/projects/1')
  }

  return (
    <div data-create-modal role="dialog">
      <h2>Create project item</h2>
      <form action={submit}>
        <button data-submit type="submit">Submit</button>
      </form>
    </div>
  )
}

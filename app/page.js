'use client';

import { useActionState } from 'react';

async function submit(previousState, formData) {
  return formData.get('name') || previousState;
}

export default function Page() {
  const [message, formAction] = useActionState(submit, 'not submitted');

  return (
    <main>
      <form action={formAction}>
        <input name="name" defaultValue="example" />
        <button type="submit">Submit</button>
      </form>
      <p>{message}</p>
    </main>
  );
}

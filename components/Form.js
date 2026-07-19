'use client'

import { useState } from 'react'

export default function Form({ data }) {
  const [state, setState] = useState(data)
  async function submit(event) {
    event.preventDefault()
    await fetch('/api/dynamic/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    })
  }
  return <form onSubmit={submit}>
    <input name="name" value={state.name || ''} onChange={(event) => setState({ name: event.target.value })} />
    <button type="submit">Submit</button>
  </form>
}

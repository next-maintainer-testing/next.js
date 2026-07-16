'use client'

import { useState } from 'react'
import { runAction } from './actions'

export default function Home() {
  const [status, setStatus] = useState('idle')

  async function invoke() {
    setStatus('pending')
    try {
      await runAction()
      setStatus('completed')
    } catch (error) {
      setStatus('failed')
    }
  }

  return (
    <main>
      <h1>Server Action page</h1>
      <button id="invoke" onClick={invoke}>Invoke action</button>
      <p id="status">{status}</p>
    </main>
  )
}

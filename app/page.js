'use client'

import { useState, useTransition } from 'react'
import { protectedAction } from './actions'

export default function Home() {
  const [result, setResult] = useState('idle')
  const [pending, startTransition] = useTransition()

  function invoke() {
    startTransition(async () => {
      try {
        const value = await protectedAction()
        setResult(value === undefined ? 'undefined' : String(value))
      } catch (error) {
        setResult(`error:${error?.message || String(error)}`)
      }
    })
  }

  return (
    <main>
      <h1>Protected page</h1>
      <button id="invoke" onClick={invoke} disabled={pending}>Invoke protected server action</button>
      <p id="result">{result}</p>
    </main>
  )
}

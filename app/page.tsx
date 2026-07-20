'use client'

import { useEffect, useState } from 'react'

type WorkerResult = {
  typeofWindow: string
  directAccess: string
}

export default function Page() {
  const [result, setResult] = useState<WorkerResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url))
    worker.onmessage = (event: MessageEvent<WorkerResult>) => setResult(event.data)
    worker.onerror = (event) => setError(event.message || 'worker error')
    worker.postMessage('inspect-window')
    return () => worker.terminate()
  }, [])

  return (
    <main>
      <h1>Web Worker window check</h1>
      <output id="result" data-ready={result || error ? 'true' : 'false'}>
        {result ? JSON.stringify(result) : error || 'waiting'}
      </output>
    </main>
  )
}

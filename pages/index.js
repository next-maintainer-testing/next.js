import { useEffect, useState } from 'react'

export default function Home() {
  const [status, setStatus] = useState('starting')

  useEffect(() => {
    const url = new URL('../workers/worker.ts', import.meta.url)
    const worker = new Worker(url)
    worker.onmessage = (event) => setStatus(event.data)
    worker.postMessage('ping')
    return () => worker.terminate()
  }, [])

  return <main><h1>Worker MIME reproduction</h1><p id="status">{status}</p></main>
}

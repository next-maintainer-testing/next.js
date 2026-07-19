'use client'

export default function Home() {
  return (
    <main>
      <h1>Public runtime environment value</h1>
      <p id="env-value">{process.env.NEXT_PUBLIC_RUNTIME_VALUE}</p>
    </main>
  )
}

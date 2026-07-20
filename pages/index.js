import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    document.documentElement.dataset.effectRan = 'true'
    setTimeout(() => {
      Promise.allSettled([Promise.resolve('ok')]).then(() => {
        document.documentElement.dataset.allSettled = 'worked'
      })
    }, 0)
  }, [])

  return <main>Promise.allSettled browser support probe</main>
}

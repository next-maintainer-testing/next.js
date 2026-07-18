'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getServerNow } from '../actions'

function updateStatus() {
  const output = document.querySelector('#action-status')
  const runs = window.__actionRuns || []
  const pending = runs.filter(run => run === 'pending').length
  output.dataset.status = pending ? 'pending' : runs.at(-1) || 'not-started'
  output.dataset.started = String(runs.length)
  output.dataset.pending = String(pending)
  output.textContent = output.dataset.status
}

export default function Page2() {
  const router = useRouter()

  useEffect(() => {
    router.push('?asdf')
    setTimeout(() => {
      window.__actionRuns ||= []
      const index = window.__actionRuns.push('pending') - 1
      updateStatus()
      getServerNow().then(
        () => {
          window.__actionRuns[index] = 'resolved'
          updateStatus()
        },
        () => {
          window.__actionRuns[index] = 'rejected'
          updateStatus()
        }
      )
    }, 0)
  }, [router])

  return (
    <main>
      <h1>Page 2</h1>
      <output id="action-status" data-status="not-started" data-started="0" data-pending="0">not-started</output>
    </main>
  )
}

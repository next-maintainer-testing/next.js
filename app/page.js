'use client'

import { useEffect, useState } from 'react'
import { failServerAction } from './actions'

export default function Home() {
  const [unhandled, setUnhandled] = useState(false)

  useEffect(() => {
    const onUnhandledRejection = () => {
      window.__ISSUE_76803_UNHANDLED__ = true
      setUnhandled(true)
    }
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }, [])

  async function callAction() {
    await failServerAction()
  }

  return (
    <main data-page-visible="true">
      <h1>Server Action boundary check</h1>
      <button id="trigger-action" onClick={callAction}>Trigger failing Server Action</button>
      <p id="unhandled-status" data-unhandled={unhandled ? 'true' : 'false'}>
        {unhandled ? 'Server Action rejection was unhandled' : 'No unhandled rejection yet'}
      </p>
    </main>
  )
}

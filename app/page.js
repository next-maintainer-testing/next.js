'use client'

import { interceptedAction } from './actions'

export default function Page() {
  async function run() {
    window.__ACTION_RESULT__ = { state: 'pending' }
    try {
      const value = await interceptedAction()
      window.__ACTION_RESULT__ = {
        state: 'resolved',
        isUndefined: value === undefined,
        value: value === undefined ? null : value,
      }
    } catch (error) {
      window.__ACTION_RESULT__ = {
        state: 'rejected',
        message: String(error && error.message ? error.message : error),
      }
    }
  }

  return <button id="run-action" onClick={run}>Run intercepted action</button>
}

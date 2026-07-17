'use client'

import { useEffect, useState } from 'react'

export default function Probe() {
  const [observation, setObservation] = useState({
    execution: 'pending',
    polyfillDone: false,
  })

  useEffect(() => {
    let execution
    try {
      new Intl.Locale('en')
      execution = 'feature-present'
    } catch {
      execution = 'feature-missing'
    }
    setObservation({
      execution,
      polyfillDone: globalThis.__polyfillDone === true,
    })
  }, [])

  return (
    <output
      id="probe"
      data-app-execution={observation.execution}
      data-polyfill-done={String(observation.polyfillDone)}
    >
      {observation.execution}:{String(observation.polyfillDone)}
    </output>
  )
}

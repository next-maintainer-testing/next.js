import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const originalLog = console.log
const observedLogs = []

try {
  globalThis.self = globalThis
  self.__NEXT_HMR_TURBOPACK_REPORT_NOISY_NOOP_EVENTS = false

  console.log = (...args) => {
    observedLogs.push(args.map(String).join(' '))
  }

  const { TurbopackHmr } = require(
    'next/dist/client/components/react-dev-overlay/utils/turbopack-hot-reloader-common.js'
  )
  const reportModule = require(
    'next/dist/client/components/react-dev-overlay/utils/report-hmr-latency.js'
  )
  const reportHmrLatency = reportModule.default ?? reportModule

  // Recreate the first-load ordering reported in the issue: the initial BUILT
  // event reaches the Turbopack HMR client before any BUILDING/update event.
  const firstLoadUpdate = new TurbopackHmr().onBuilt()
  if (firstLoadUpdate != null) {
    reportHmrLatency(
      () => {},
      [...firstLoadUpdate.updatedModules],
      firstLoadUpdate.startMsSinceEpoch,
      firstLoadUpdate.endMsSinceEpoch,
      firstLoadUpdate.hasUpdates
    )
  }

  const symptom = observedLogs.includes('[Fast Refresh] done in NaNms')
  process.exitCode = symptom ? 0 : 1

  console.log = originalLog
  originalLog(
    symptom
      ? 'REPRODUCED: first-load HMR logged "[Fast Refresh] done in NaNms"'
      : `NOT REPRODUCED: first-load HMR logs were ${JSON.stringify(observedLogs)}`
  )
} catch (error) {
  process.exitCode = 2
  console.log = originalLog
  console.error('CHECK FAILED:', error?.stack ?? error)
}

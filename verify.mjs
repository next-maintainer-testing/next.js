import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'

let verdict = 2

try {
  process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = 'next'
  const require = createRequire(import.meta.url)
  require('next/dist/server/require-hook')

  globalThis.window = {
    location: { origin: 'http://localhost:3000' },
    navigator: { userAgent: 'node-verification' },
    addEventListener() {},
    removeEventListener() {},
  }

  const requests = []
  globalThis.fetch = async (input, init = {}) => {
    requests.push({ input: String(input), method: init.method, headers: new Headers(init.headers) })
    return new Response('Unauthorized by middleware', {
      status: 401,
      headers: { 'content-type': 'text/plain' },
    })
  }

  const { serverActionReducer } = require(
    'next/dist/client/components/router-reducer/reducers/server-action-reducer',
  )
  if (typeof serverActionReducer !== 'function') {
    throw new Error('Next.js did not export serverActionReducer')
  }

  const state = {
    tree: [''],
    canonicalUrl: '/',
    nextUrl: null,
    prefetchCache: new Map(),
    cache: {},
    pushRef: {},
    focusAndScrollRef: {},
  }

  let settled = false
  let settleOutcome
  const outcomePromise = new Promise((resolve) => {
    settleOutcome = resolve
  })
  const action = {
    actionId: 'reproduction-action-id',
    actionArgs: [],
    mutable: {},
    resolve(value) {
      settled = true
      settleOutcome({ state: 'resolved', isUndefined: value === undefined, value })
    },
    reject(error) {
      settled = true
      settleOutcome({
        state: 'rejected',
        message: String(error && error.message ? error.message : error),
      })
    },
    changeByServerResponse() {},
  }

  for (let attempt = 0; attempt < 3 && !settled; attempt += 1) {
    try {
      const returned = serverActionReducer(state, action)
      if (returned && typeof returned.then === 'function') await returned
    } catch (thrown) {
      if (thrown && typeof thrown.then === 'function') {
        await thrown
      } else {
        throw thrown
      }
    }
  }

  const outcome = await Promise.race([
    outcomePromise,
    delay(5000).then(() => {
      throw new Error('Server Action reducer did not settle the client action promise')
    }),
  ])

  if (requests.length !== 1 || requests[0].method !== 'POST') {
    throw new Error(`Expected one Server Action POST, observed ${requests.length}`)
  }
  if (!requests[0].headers.get('next-action')) {
    throw new Error('Server Action request did not contain the Next-Action header')
  }

  if (outcome.state === 'resolved' && outcome.isUndefined) {
    console.log('SYMPTOM_PRESENT: intercepted Server Action promise resolved with undefined')
    verdict = 0
  } else {
    console.log(`SYMPTOM_ABSENT: ${JSON.stringify(outcome)}`)
    verdict = 1
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error && error.stack ? error.stack : error}`)
  verdict = 2
} finally {
  process.exitCode = verdict
}

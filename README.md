# Next.js issue 86390 reproduction

A Route Handler imports `notFound` from `next/navigation.js`. On Next.js 16.0.2-canary.27, the default Turbopack production build crashes while collecting page data because `app-router-context.js` cannot be parsed/found.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported symptom reproduced; exit 1 means it is absent.

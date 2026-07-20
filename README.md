# Next.js issue 63469 reproduction

This app calls `Promise.allSettled` in client code. The verifier launches a module-capable Chromium runtime with that API removed, modeling Chrome 61–75: those releases support ES modules but predate `Promise.allSettled`. It confirms the page reaches React's effect and then observes the resulting browser runtime error rather than treating the presence of a `nomodule` script as sufficient evidence.

Run `npm install && node verify.mjs`. Exit 0 means the reported runtime failure is present; exit 1 means the API was polyfilled and worked.

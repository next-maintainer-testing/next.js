# Next.js empty-string `pushState` reproduction

Minimal reproduction for vercel/next.js issue #68015. After the App Router hydrates, the verification script calls `window.history.pushState('', '', '/help')` and checks whether Next.js throws the reported `TypeError` while copying its internal history state.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.

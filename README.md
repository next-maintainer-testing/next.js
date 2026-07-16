# Next.js issue 87012 reproduction

This minimal app places an `async` function component in the client graph. Rendering `/bug` calls `/api/backend`; the verifier observes whether the browser repeatedly requests that endpoint instead of making one request or rejecting the unsupported component.

Run `npm install`, then `node verify.mjs`. Exit code 0 means at least three backend requests were observed in one page load (the reported symptom); exit code 1 means the repeated-request symptom was absent.

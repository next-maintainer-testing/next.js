# Next.js issue #76778 reproduction

This minimal app enables `experimental.dynamicIO` (renamed `cacheComponents` in Next.js 16), renders the asynchronous root `<html>`/`<body>` layout below a React Suspense boundary, and invokes `notFound()` from the page. The verifier starts `next dev`, requests `/`, confirms that the intentional not-found path ran, and reports the bug only when the runtime response omits both root document tags.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.

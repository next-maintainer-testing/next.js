# Next.js issue 85604 reproduction

This minimal App Router project passes the `next/link` export from a Server Component to a Client Component as `linkComponent`. On affected Next.js versions, `next build` fails while prerendering `/_not-found` because that function is rejected as a non-serializable Client Component prop.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom was observed; exit code 1 means it was absent.

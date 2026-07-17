# Next.js issue 83034 reproduction

This production-mode App Router app has a `force-dynamic` home page whose server-rendered UUID should change on every client navigation. A client component in the root layout invokes a Server Action once after mount, and that action sets a cookie, matching the reported trigger. `verify.mjs` uses a real browser to navigate `/` to `/test` and back repeatedly.

The reported symptom is present when the second home visit reuses the initial UUID but the third visit receives a fresh UUID. Run `npm install`, then `node verify.mjs`. Exit code 0 means that exact symptom is present; exit code 1 means it is absent; any other code means the check failed.

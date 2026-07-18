# Next.js issue 77240 reproduction

This app renders the reported client button: `onClick={async () => redirect('/target')}`. The verifier mounts that same component, clicks it, and detects whether its rejected promise is exposed as an unhandled `NEXT_REDIRECT` error.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means it is absent.

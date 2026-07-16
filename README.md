# next/form submitter reproduction

This minimal app reproduces vercel/next.js#84857: a named submit button contributes its value to a native GET form submission, but `next/form` omits it from the client-side navigation URL.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the bug is present; exit code 1 means it is absent.

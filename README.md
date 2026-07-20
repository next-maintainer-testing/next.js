# Next.js issue 43021 reproduction

This minimal app demonstrates that `next lint` in Next.js 13.0.3 reports success while ignoring a Prettier violation in `app/page.js`. Running ESLint directly on that file reports the violation.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported silent-skip symptom is present; exit code 1 means it is absent; any other exit code means verification failed.

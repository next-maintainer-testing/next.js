# Next.js issue 77199 reproduction

This minimal app reproduces the reporter's TypeScript-language-service symptom: the Next.js TypeScript plugin diagnoses an invalid `revalidate` export in `app/page.tsx` but omits the same diagnostic from `app/api/route.ts`.

Run `npm install` and `node verify.mjs`. Exit code 0 means the symptom is present, 1 means it is absent, and any other code means the check failed.

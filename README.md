# Next.js issue #61213 reproduction

This minimal app uses `output: 'export'`. Its dynamic route exports `generateStaticParams`, which legitimately returns an empty array. On the reported Next.js version, `next build` incorrectly says the function is missing.

Run `npm install` and `npm run verify`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.

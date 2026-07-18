# Next.js issue 46622 reproduction

This minimal app combines an App Router dynamic route using `generateStaticParams` with a Pages Router `i18n` configuration. On affected Next.js versions, `next build` strips the default locale and reports an export-path mismatch.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.

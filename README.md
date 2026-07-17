# Next.js issue 47689 reproduction

This minimal App Router project enables typed routes and declares the reported generic `Pager` callback returning `Route<T> | URL`. The persisted check generates route types with `next build`, runs TypeScript, and reports the bug only when TypeScript rejects the callback result at `Link`'s `href` prop.

Run `node verify.mjs`. Exit code 0 means the reported symptom is present, 1 means it is absent, and 2 means the check could not reach a valid conclusion.

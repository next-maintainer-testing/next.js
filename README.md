# Next.js issue 62343 reproduction

This minimal App Router project has a normal `app/sitemap.ts` whose `generateSitemaps` export is fully commented out. On the reported Next.js 14.0.3, `next build` still treats the sitemap as a multi-sitemap route and calls the missing function.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom was observed; exit code 1 means the build succeeded and the symptom is absent.

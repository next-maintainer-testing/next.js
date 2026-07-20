# Sitemap cache-control reproduction

This minimal Next.js app reproduces vercel/next.js issue #61616. Its `app/sitemap.ts` exports `revalidate = 3600`, while the reported Next.js release serves `/sitemap.xml` with `Cache-Control: public, max-age=0, must-revalidate`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported cache-header symptom is present; exit code 1 means it is absent.

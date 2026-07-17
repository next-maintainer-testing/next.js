# Next.js issue 54665 reproduction

This minimal App Router project configures custom `pageExtensions` while keeping the reserved metadata file at `app/sitemap.ts`. Run `node verify.mjs`; exit code 0 means the app serves normally but `/sitemap.xml` returns the reported 404.

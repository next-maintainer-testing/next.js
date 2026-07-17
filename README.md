# Next.js issue 85103 reproduction

This minimal app defines a generated sitemap at `/pathname/sitemap/0.xml` with a media alternate. Run `npm install`, then `node verify.mjs`. Exit 0 means the sitemap omitted the expected media alternate (the reported symptom); exit 1 means it was emitted.

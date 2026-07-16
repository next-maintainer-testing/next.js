# Next.js issue 75174 reproduction

This minimal app combines an edge-runtime sitemap with `generateSitemaps`. Run `npm install` and `node verify.mjs`; exit 0 means the reported build error was observed, exit 1 means it was absent, and any other exit code means verification failed.

# Next.js issue 64952 reproduction

This minimal App Router project compares the same encoded dynamic segment as observed by a page and a route handler. Run `node verify.mjs`; exit 0 means the reported inconsistent decoding is present, exit 1 means it is absent, and any other exit code means verification failed.

# Next.js issue 73284 reproduction

This minimal App Router project combines a root catch-all route with a nested parallel route. Run `node verify.mjs`; exit 0 means `next build` reproduced the reported `entryCSSFiles` crash, exit 1 means the build succeeded, and any other exit code means the check itself failed.

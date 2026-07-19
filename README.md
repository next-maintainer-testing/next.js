# Next.js issue 40760 reproduction

This minimal standalone build emulates Windows returning `EPERM` when Next.js scans the generated standalone `node_modules/next` link. `node verify.mjs` exits 0 only when the reported build failure occurs.

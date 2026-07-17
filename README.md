# Next.js issue 82945 reproduction

This minimal App Router project imports `./marker.js` while only `app/marker.ts` exists. Run `node verify.mjs`; exit 0 means Turbopack exhibited the reported module-resolution failure, exit 1 means the TypeScript module resolved, and any other exit code means the check itself failed.

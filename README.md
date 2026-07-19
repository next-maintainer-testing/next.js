# Next.js issue 77064 reproduction

This minimal app reproduces an extra dashboard RSC request when `router.push` follows a completed explicit `router.prefetch` and a server action. Run `node verify.mjs`; exit 0 means the reported extra request occurred, exit 1 means it did not, and another exit code means verification failed.

# Next.js issue 88032 reproduction

This static-export App Router project mounts two `Link` components with the same `href`: one uses default prefetching and one uses `prefetch={true}`. The verifier builds and serves the export, reveals both links, and confirms whether clicking either link can soft-navigate to the generated blog route.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported navigation failure occurred; 1 means both links navigated successfully; another code means verification failed.

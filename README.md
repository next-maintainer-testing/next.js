# Next.js issue 50522 reproduction

This minimal App Router edge route inspects its real route-handler context. The verifier reports the returned observation and exits 0 when `context.waitUntil` is unavailable, matching the issue.

Run with `npm install` followed by `node verify.mjs`.

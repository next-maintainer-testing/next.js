# Delayed Suspense fallback after a search-param navigation

This minimal App Router dashboard reproduces vercel/next.js#76954. Clicking the filter performs a search-param navigation while each dashboard result is streamed behind a keyed Suspense boundary. The verifier applies deterministic browser network latency, representing the slow connection described in the report.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the old card remained visible for a noticeable interval before the fallback appeared; exit code 1 means the fallback appeared promptly or the reported sequence did not occur.

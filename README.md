# Next.js issue 76769 reproduction

This minimal App Router page mirrors the reporter's `force-static` dynamic route and reads a value through `unstable_cache` with a short time-based revalidation period. The verification requests the page after expiry and checks whether repeated refreshes remain stuck on the original rendered cache value.

Run with `node verify.mjs`. Exit 0 means the reported stale-data symptom is present; exit 1 means refreshed output exposes a revalidated value.

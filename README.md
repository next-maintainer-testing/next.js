# Next.js issue 79307 reproduction

This minimal production app calls `unstable_cache` from a dynamic Server Component with a five-second revalidation window. `node verify.mjs` primes the cache, waits for expiry, and observes whether the first expired request receives the old value while a background refresh creates a new value. It exits 0 only when that reported stale-while-revalidate symptom occurs.

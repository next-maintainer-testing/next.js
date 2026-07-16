# Next.js issue 86898 reproduction

This app caches an upstream response through `fetch(new Request(...))`, with a cache tag supplied to the `Request` constructor. The verifier confirms that caching is active, calls `revalidateTag`, and then checks whether the upstream is contacted again.

Run `npm install && node verify.mjs`. Exit code 0 means the stale tagged response remained after invalidation; exit code 1 means invalidation fetched a fresh response.

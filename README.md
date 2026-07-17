# Next.js issue 48169 reproduction

This app calls one function wrapped with React `cache()` twice with the same argument during a single middleware request. Request `/probe`: the reported caching bug is present if `cache()` is unavailable in middleware or if the callback runs twice (`calls: 2`, with distinct results). It is absent only when the callback runs once and React returns the memoized result.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present, 1 means it is absent, and any other exit code means verification failed.

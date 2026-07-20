# Issue 75083 reproduction

This minimal App Router route passes a `Map` containing a sort order to `unstable_cache`. The verifier requests ascending data and then descending data. The bug is present when both requests return the same ascending data because distinct `Map` contents collide in the cache key.

Run `npm install` and `node verify.mjs`.

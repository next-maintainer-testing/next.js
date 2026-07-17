# Next.js issue #77412 reproduction

This standalone app reproduces nested `unstable_cache` invalidation. The outer cache expires after two seconds while the inner cache is valid for sixty seconds. `node verify.mjs` checks whether expiration of the outer entry incorrectly causes the still-valid inner function to execute again.

The verifier exits 0 when the reported symptom is present, 1 when it is absent, and 2 when setup or observation fails.

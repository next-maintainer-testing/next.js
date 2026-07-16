# Next.js issue 54980 reproduction

This app has a `not-found.js` inside `app/group-dir/(group)`. Calling `notFound()` from the matched `/group-dir/trigger` route renders that local boundary, while an unmatched URL below the same route (`/group-dir/unmatched`) does not.

Run `node verify.mjs`. Exit code 0 means the reported symptom is present, 1 means it is absent, and any other exit code means verification failed.

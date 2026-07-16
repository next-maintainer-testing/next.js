# Next.js issue 72546 reproduction

This app caches whether a page exists with `unstable_cache` and a cache tag. The initial request is a cached 404. `POST /api/publish` changes the backing data and calls `revalidateTag`; the page should then regenerate as a 200 response.

Run `node verify.mjs`. Exit 0 means the stale cached 404 remains after tag invalidation, exit 1 means the page regenerates, and any other exit code means the check failed.

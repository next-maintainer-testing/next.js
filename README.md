# Next.js issue 73094 reproduction

This reconstructs the reported `use cache` middleware shape. A serializable query-options object also carries request context and a `next` callback. Calling that callback inside a cached function fails at the cache serialization boundary, while the route is expected to render the returned email.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported cache failure is present, 1 means it is absent, and any other code means the check itself failed.

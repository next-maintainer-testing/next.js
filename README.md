# Next.js issue 76073 reproduction

This minimal App Router project has a route at `/dynamic-route/search-params` that awaits the `searchParams` dynamic API. `node verify.mjs` runs `next build --debug` and reports the issue when the build emits the reported `Static generation failed due to dynamic usage` error for that route.

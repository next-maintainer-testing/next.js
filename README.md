# Next.js issue 73424 reproduction

This standalone app imports `ioredis` in Edge Middleware and calls `redis.set()` on a request to `/`. Run `npm install`, then `npm run dev`, and request `http://localhost:3000/`. The reported symptom is a middleware crash from `redis-errors` because `process.version` is undefined in the Edge Runtime.

`node verify.mjs` starts the development server, requests `/`, and exits 0 only if it directly observes the reported `charCodeAt` TypeError.

# Issue 74958 reproduction

This app configures `@neshca/cache-handler` through Next.js instrumentation and uses its `registerInitialCache` helper. A filesystem-backed observer replaces Redis so the exact route keys populated at production startup are deterministic and need no external service.

Run `node verify.mjs`. Exit 0 means startup populated `/xpto` but omitted the prerendered root route (`/index` or `/`), matching the report. Exit 1 means the root was also populated.

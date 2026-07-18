# Next.js SWC scope-collision reproduction

This minimal app imports a small precompiled CommonJS package matching the reporter's code shape. A Next.js 16.0.4 Turbopack production build emits a `veV` method that references an undeclared variable and throws at runtime. `node verify.mjs` builds the app, executes the emitted client module, invokes `veV`, and exits 0 only when that exception occurs.

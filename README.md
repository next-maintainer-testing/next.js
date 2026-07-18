# Next.js issue #79279 reproduction

This minimal App Router project pins the reported Next.js 15.3.2 and React 19.1.0 versions. `node verify.mjs` recreates the initial Turbopack HMR `BUILT` event ordering and exits 0 only when the client emits `[Fast Refresh] done in NaNms`.

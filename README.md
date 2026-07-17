# Next.js issue 78591 reproduction

This minimal App Router page imports `@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm` and keeps the import live, matching the reported Turbopack resource-exhaustion hang. Run `npm install` and `node verify.mjs`; exit 0 means compilation either failed from a killed build worker or did not finish within 60 seconds, while exit 1 means it completed.
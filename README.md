# Issue 66503 reproduction

This minimal App Router page makes the same `graphql-request` query twice during one server render. The custom fetch is wrapped in React `cache`, as in the report. It uses `cache: 'no-store'` only to isolate request memoization from the persistent Next.js Data Cache.

`verify.mjs` runs a local GraphQL endpoint and counts actual POST requests. Run `npm install && node verify.mjs`. Exit 0 means the duplicate-request symptom is present; exit 1 means it is absent.

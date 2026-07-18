# Reproduction for vercel/next.js #67738

This Pages Router app combines `basePath: '/base'` with a no-op Middleware. In the reported bug, the home page's soft-navigation data request at `/base/_next/data/development/index.json` receives a permanent redirect to `/base` instead of JSON, preventing fresh `getServerSideProps` data from reaching the page.

Run `npm install` and `node verify.mjs`. Exit code 0 means the redirect bug is present; exit code 1 means it is absent.

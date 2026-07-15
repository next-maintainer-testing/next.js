# Next.js issue #69401 reproduction

This minimal Pages Router app reproduces the URL/content mismatch reported in vercel/next.js#69401 on `next@15.0.0-canary.132` with the reporter's React RC versions.

Run `npm install` and `node verify.mjs`. The check opens Page 1, navigates to Page 2, reloads, and goes back while reload scripts are held before router hydration. Exit code 0 means the browser URL is `/page1` while Page 2 remains rendered; exit code 1 means the symptom is absent; any other code means the check failed.

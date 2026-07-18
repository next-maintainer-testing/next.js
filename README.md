# Next.js issue 49297 reproduction

This app reproduces navigation to the same App Router page with a changed search parameter. The destination server component deliberately waits 2.5 seconds. `verify.mjs` opens the page, follows the Next.js `Link`, observes DOM mutations throughout the pending navigation, and reports the bug when `loading.js` never appears before the new results arrive.

Run `npm install`, install Playwright Chromium if needed, and execute `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means the loading UI appeared; any other exit code means verification failed.

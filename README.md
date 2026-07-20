# Next.js browser-back server action reproduction

This app reproduces vercel/next.js#56811. From `/`, navigate through the character link, use the browser Back button, then scroll to the infinite-query sentinel twice. On affected versions, the second server-action call remains pending and the UI stays on “Fetching next page...”.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the symptom was observed; 1 means it was absent; any other code means the check failed.
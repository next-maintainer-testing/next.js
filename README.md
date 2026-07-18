# Next.js issue 19046 reproduction

This minimal Pages Router page runs `next build` with `NODE_ENV=development`. On the reported release, the production build incorrectly retains development behavior and fails while prerendering with `<Html> should not be imported outside of pages/_document.`

Run `npm install`, then `node verify.mjs`. Exit 0 means the exact reported symptom is present, exit 1 means the build succeeds and the symptom is absent, and any other exit code means the check failed.

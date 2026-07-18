# Next.js issue 72909 reproduction

This minimal app reproduces a route handler being called twice after one client-side `<Link>` click. Run `npm install` and `node verify.mjs`; exit 0 means the duplicate RSC and document requests occurred, exit 1 means they did not, and any other exit code means the check failed.

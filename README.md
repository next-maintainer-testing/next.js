# Next.js issue 54685 reproduction

This Pages Router app calls `useSyncExternalStore` with two arguments. Run `npm install`, then `node verify.mjs`; exit code 0 means the reported server-rendering error was observed, and exit code 1 means it was absent.

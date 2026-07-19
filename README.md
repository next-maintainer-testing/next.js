# Next.js issue 77188 reproduction

This minimal Pages Router app mirrors the reporter's setup: browser React 18.3.1 is loaded as a production UMD global, webpack externalizes `react` and `react-dom`, and a ref is passed to a component loaded by `next/dynamic` in development mode.

Run `node verify.mjs`. Exit 0 means the reported `getStackAddendum` browser exception occurred, exit 1 means it was absent, and another code means the check failed.

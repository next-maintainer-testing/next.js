# Issue 74743 reproduction

Minimal App Router reproduction for the browser error `TypeError: $ is not a function` when Next.js uses a `.babelrc` with `next/babel`, `useBuiltIns: usage`, and core-js 3.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported browser exception occurred; exit 1 means the page loaded without it.

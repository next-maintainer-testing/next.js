# Issue 68003 reproduction

This minimal App Router project uses the default `next.config.mjs` filename with the CommonJS `require('@next/mdx')()` configuration shown by the documentation reported in issue #68003. `node verify.mjs` succeeds only when `next build` emits the reported `require is not defined in ES module scope` error.

The issue did not state a package version. This reproduction pins Next.js 14.2.5, the current stable release when the issue was opened on July 21, 2024, with React 18.2.0.

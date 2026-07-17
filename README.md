# Issue 58472 reproduction

This minimal project checks TypeScript's `moduleResolution: "node"` handling of `@next/third-parties/google`.

`node verify.mjs` reads the installed exact Next.js version, stages the matching `@next/third-parties` package, and runs TypeScript. It exits 0 only when TypeScript reports TS2307 for the reported import, 1 when the import resolves, and 2 if setup or compilation fails for another reason.

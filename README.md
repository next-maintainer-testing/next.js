# Issue 73726 reproduction

This app mirrors the reported `next/font` plus Tailwind build path while using
a local font to avoid a network dependency. It pins the broken
`@jridgewell/gen-mapping@0.3.6` release selected when the issue was reported;
that tarball omitted its `dist` files.

After installing dependencies, run `node verify.mjs`. Exit 0 means the reported
`next/font` build failure was observed; exit 1 means the build passed.

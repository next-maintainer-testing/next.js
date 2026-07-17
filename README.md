# Issue 52050 reproduction

This minimal App Router project uses `next/font/google` with static export and the relative `assetPrefix: './'`. Run `npm install` and `node verify.mjs`; exit 0 means the build reproduced the reported `next/font` rejection of the relative prefix.

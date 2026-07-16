# Next.js issue 35674 reproduction

This app serves a WebP image containing transparent pixels through `next/image`. The verification script requests the image optimizer without WebP support and checks whether Next.js emits a JPEG whose formerly transparent pixels are black.

Run `npm install` and then `node verify.mjs`. Exit code 0 means the reported bug is present; exit code 1 means it is absent.

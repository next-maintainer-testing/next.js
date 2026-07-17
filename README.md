# Next.js issue 62332 reproduction

Run `node verify.mjs`. The check starts `next dev`, requests the initial HTML, and exits 0 when the local font configured with `preload: true` has no font preload link.

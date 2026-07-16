# Next.js issue #60040 reproduction

This minimal custom server passes `conf.distDir: '.custom_dist'` to `next()`. Run `npm install` and `node verify.mjs`. The verifier exits 0 when startup uses `.next` instead of `.custom_dist`, and exits 1 when the reported symptom is absent.

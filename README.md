# Next.js Edge Runtime Buffer reproduction

This minimal Pages Router app exercises `Buffer.from(...).toString('base64')` inside Edge Middleware. The middleware returns the result in `x-edge-buffer-result`, and `verify.mjs` makes a real HTTP request and checks that value.

Run with `npm install && node verify.mjs`.

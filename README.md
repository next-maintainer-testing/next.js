# Next.js issue 49397 reproduction

This minimal app reproduces the reporter's Jest/JSDOM setup. The Jest setup file calls `require('next')` to install Next.js's built-in fetch support, and the test invokes that polyfill when Next.js provides it. With Next.js 13.4.1, the request throws `ReferenceError: TextEncoder is not defined` from Next.js's compiled Undici implementation.

Run `npm install` and then `node verify.mjs`. The verifier exits 0 only when that exact runtime error is observed, 1 when it is absent, and 2 for unrelated failures. Modern Next.js versions that no longer install the legacy fetch polyfill are classified as not exhibiting this specific TextEncoder symptom.

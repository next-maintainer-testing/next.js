# Next.js issue 86509 reproduction

This minimal app builds a CSS rule containing individual `rotate` and `translate` properties around `transform`. The verifier checks the emitted CSS bundle and reports the issue when those declarations are removed or folded into `transform`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.

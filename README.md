# Next.js issue 71311 reproduction

This minimal App Router app reproduces the sequential redirect reported in vercel/next.js#71311. A server action redirects to `/?hello=xyz`; middleware adds `identifier=yolo` and redirects again. The verifier observes whether the client URL after the action omits the middleware-added parameter, then confirms that reloading allows the parameter to appear.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom is present, 1 means it is absent, and any other code means the check failed.

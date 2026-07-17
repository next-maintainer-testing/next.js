# router.asPath hash-fragment reproduction

This minimal Pages Router app corresponds to vercel/next.js issue #25202. The verifier creates the client router at `/my-page/#my-subheading` and reads the public `router.asPath` value. Exit code 0 means the reported hash-fragment symptom is present; exit code 1 means it is absent.

Run `npm install` and then `node verify.mjs`.

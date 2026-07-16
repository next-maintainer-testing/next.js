# Next.js issue 50150 reproduction

This minimal App Router page is dynamic and has a root `loading.js`. The verifier requests the production HTML as a client without JavaScript and reports the bug when the loading UI remains visible while the resolved page is emitted only inside a hidden container.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.

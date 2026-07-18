# Next.js image optimizer reproduction

This minimal app mirrors the reported image configuration and models the deployment-only path with a reverse proxy that drops the query string while forwarding `/_next/image`. The browser-facing request contains `url`, `w`, and `q`; the verifier first proves that this request succeeds directly, then reports the symptom only if the deployed path returns `400` and `"url" parameter is required` after the proxy removes those parameters.

This distinction makes the deployment condition explicit: the error is produced because the optimizer does not receive the query string, not because Next.js rejects the same complete request that succeeds upstream.

Run with `node verify.mjs` after installing dependencies. Exit code 0 means the reported symptom occurred, 1 means it was absent, and any other code means the check failed.

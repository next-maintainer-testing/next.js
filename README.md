# Next.js issue 68581 reproduction

This minimal App Router application preserves the reporter's original sequence: `/login` is protected by middleware, the home page exposes a prefetched `Link`, and its **Set Cookie** control mutates the cookie from the client. The verifier loads a fresh home page, waits for the protected link's no-cookie prefetch, sets the cookie, and follows that client-side link. The symptom is present if the stale middleware decision still redirects the now-authenticated browser to `/?login=0` instead of rendering `/login`.

Run `npm install`, then `node verify.mjs`.

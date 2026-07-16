# Next.js issue 64870 reproduction

This minimal App Router project places `not-found.jsx` under a dynamic `[lang]` root segment. The verifier confirms `/en/` is valid, requests the nonexistent nested URL `/en/pricing/`, and reports the bug when the response is the default 404 rather than the custom language 404 marker.

Run with `npm install`, then `node verify.mjs`.

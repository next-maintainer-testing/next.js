# Next.js issue 53438 reproduction

This minimal app rewrites `/image/:url*` to an API route. The verifier requests an image path containing an embedded `https://` URL and reports the bug only when normalization redirects the normalized URL back to itself, creating a redirect loop.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the redirect-loop symptom is present; exit code 1 means it is absent.

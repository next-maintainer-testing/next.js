# Next.js issue 77637 reproduction

A middleware sets one cookie with `maxAge`, while `/redirect` redirects from a Server Component. Run `npm install` and `node verify.mjs`; exit 0 means the redirect response contains the middleware cookie more than once, exit 1 means it does not, and any other exit code means the check failed.

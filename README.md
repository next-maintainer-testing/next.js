# Next.js issue 48609 reproduction

This minimal App Router project reproduces the report with a nested dynamic route at `app/(site)/memberships/benefits/[slug]/page.js`. The page calls `notFound()`, while `app/not-found.js` renders the unique text `ROOT NOT FOUND MARKER`.

Run `npm install`, then `node verify.mjs`. The check builds and starts the production server, then requests the nested route. Exit code 0 means the response failed to render the root not-found page; exit code 1 means it rendered correctly. Other exit codes indicate an invalid check.

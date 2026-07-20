# Next.js issue 92341 reproduction

This static-export App Router project reproduces the reporter's `Link` with `prefetch={true}`. The verifier builds the export, serves it, and confirms in Chromium that the prefetch receives HTML and the click remains on the home page.

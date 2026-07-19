# Next.js issue 65359 reproduction

This minimal App Router application models the reported sequence: add client-side items on the home route, navigate to `/blog/10`, then use browser Back. `node verify.mjs` reports the bug when the home route's client state is reset after Back.

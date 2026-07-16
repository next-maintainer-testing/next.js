# Next.js issue 53292 reproduction

The root layout always returns the ordinary `children` slot because `isAuthenticated` is false. Requesting `/` should therefore execute only `app/page.js`, but Next.js also executes the unselected `@auth` parallel route.

Run `npm install` and `node verify.mjs`. Exit code 0 means the unselected route executed; exit code 1 means it did not.

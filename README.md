# Next.js issue #83099 reproduction

This checks the inline documentation shipped with Next.js for `redirect`. The reported symptom is present when the documented supported contexts list Server Components, Route Handlers, and Server Actions but omit Client Components, despite `redirect` being supported in Client Components.

Run `node verify.mjs` after installing dependencies. Exit code 0 means the documentation issue is present, 1 means it is fixed, and any other exit code means the check failed.

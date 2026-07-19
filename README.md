# Next.js issue 73786 reproduction

This app sets `basePath: '/test'` and uses the middleware matcher reported in the issue. The middleware should redirect the base-path root (`/test`) to `/test/redirected`, but the reported bug causes the root page to be served directly.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means the middleware redirected correctly.

# Next.js basePath route-handler reproduction

Issue: https://github.com/vercel/next.js/issues/62756

With `basePath: "/custom"`, requesting `/custom/hello` reaches the route handler, but the handler observes `request.url` with pathname `/hello` rather than `/custom/hello`.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.

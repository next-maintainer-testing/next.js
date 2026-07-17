# Next.js issue 83001 reproduction

This minimal App Router project calls patched `fetch` with a `Request` whose mode is `no-cors` and whose body began as an empty string inside `generateStaticParams` for a dynamic route.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported ReadableStream/mode error was observed; exit 1 means it was absent.

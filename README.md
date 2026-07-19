# Next.js issue 58883 reproduction

This minimal app reproduces the incorrect TypeScript line number in a development-server stack trace. Run `npm install`, start `npm run dev`, and request `/api/test-pages`. The `Error` is created on line 4 of `src/pages/api/test-pages.ts`; affected versions report another line.

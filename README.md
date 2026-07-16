# Next.js issue #69679 reproduction

The parent `[locale]` segment sets `dynamicParams = false` and generates only `en`. The persisted check starts the development server and requests `/de/docs`; rendering that nested catch-all route instead of returning 404 reproduces the issue.

Run `npm install`, then `node verify.mjs`.

# Next.js issue 78616 reproduction

This minimal npm workspace runs the `apps/web` development server with Turbopack. Its intentional missing import produces a development error; `node verify.mjs` checks whether the returned overlay error path is incorrectly relative to the workspace root (`./apps/web/app/page.js`) rather than the app working directory.

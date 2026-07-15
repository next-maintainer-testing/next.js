# Next.js issue 62133 reproduction

This Pages Router app enables `experimental.scrollRestoration`, matching the report. In affected Next.js versions, the built client sets `window.history.scrollRestoration` to `manual`; WebKit suppresses the normal iOS swipe-back page snapshot in that mode.

Run `npm install && npm run verify`. The verifier builds the app and exits 0 only when the generated client contains the `manual` history scroll-restoration assignment, 1 when it is absent, and 2 if setup or inspection fails.

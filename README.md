# Issue 73713 reproduction

The shared root layout renders a `Home` link before a tall shared navigation region. `verify.mjs` opens the app, clicks that current-page link, and checks whether Next.js incorrectly moves focus and scrolls to the focusable `#page-content` root from `app/page.js` rather than retaining focus in the shared layout.

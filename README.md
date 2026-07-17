# Next.js issue 75334 reproduction

This minimal production App Router app has static title and viewport metadata in the root layout. A client-side link navigates to a dynamic page using `connection()` with a colocated `loading.js`. The verifier observes whether the root title or theme-color metadata disappears while the loading UI is displayed.

Run `node verify.mjs`; exit 0 means the reported metadata flicker occurred, exit 1 means it did not.

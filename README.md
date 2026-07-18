# Next.js issue 45825 reproduction

This app intentionally reads `localStorage` during the initial render, producing different server and client trees. `verify.mjs` opens the page with the relevant storage value preloaded and checks that the resulting hydration diagnostic reports only the generic component stack rather than the exact `localStorage` culprit location.

# Issue 79571 reproduction

This minimal App Router project renders a parallel route inside a global sticky header. `node verify.mjs` scrolls the first page, performs a client-side navigation, and reports the bug when the new page retains the old scroll position.

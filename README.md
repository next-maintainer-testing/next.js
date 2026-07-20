# Next.js issue 71601 reproduction

This minimal App Router application establishes an `AsyncLocalStorage` trace while the root layout returns its subtree. The page directly reports whether its server render inherited that trace.

Run `npm install && node verify.mjs`. Exit code 0 means the reported symptom is present: the page rendered outside the layout's instrumentation scope and returned `data-trace="missing"`. Exit code 1 means the page inherited `layout-trace`.

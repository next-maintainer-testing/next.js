# Next.js issue 47450 reproduction

The nested route re-exports the named client layout from `src/layout.jsx` through `app/nested/layout.jsx` without repeating the `use client` directive. The verifier runs a clean production build and detects the reported client-module `.then` prerender failure.

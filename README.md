# Next.js issue 82650 reproduction

This minimal app dynamically imports a Server Component containing an inline `"use cache"` function. Run `node verify.mjs`; exit 0 means the reported Turbopack development compiler error occurred, and exit 1 means the route rendered successfully without it.

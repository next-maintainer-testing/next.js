# Next.js issue 61180 reproduction

This minimal app preserves the report's `next/dynamic(() => import(`${componentPath}`))` pattern under `next dev --turbo`. The requested `./ChatSidebar` module exists, so the check distinguishes the reported Turbopack resolution failure from an actually missing source file.

Run `node verify.mjs`. Exit 0 means the reported `Module not found` symptom occurred; exit 1 means `/chat` rendered without it.

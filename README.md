# Next.js issue 78429 reproduction

This App Router application reproduces excessive renders of a layout-level client component using `usePathname` when navigating between async pages. Run `npm install` and `node verify.mjs`; exit 0 means the reported symptom was observed, exit 1 means it was absent, and any other exit code means the check failed.

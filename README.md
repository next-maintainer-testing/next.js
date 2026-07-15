# Next.js issue 44901 reproduction

This minimal App Router project reproduces the reported production-mode bug: a client component imported by the server root layout and exported through `React.memo` remounts during a `next/link` navigation. The check increments state in that root component, navigates from `/` to `/about`, and exits 0 only when the state resets and a second mount is observed.

Run `npm install --legacy-peer-deps`, then `node verify.mjs`.

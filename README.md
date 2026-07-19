# Next.js link focus reproduction

Minimal App Router reproduction for vercel/next.js issue #33060. The browser check clicks the About `next/link` and reports the symptom when that anchor remains `document.activeElement` after navigation completes.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present; exit 1 means absent.

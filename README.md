# Next.js issue 85477 reproduction

This minimal Pages Router app renders a clickable card with `next/link`. The link contains the visible title and a `next/image` whose `alt` repeats the title, reproducing the reported rendered anchor markup on Next.js 16.0.0 and React 19.2.0.

Run `npm install`, then `node verify.mjs`. Exit 0 means the rendered anchor contains both title text and the image markup; exit 1 means that symptom is absent.

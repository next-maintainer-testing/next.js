# Next.js issue 42140 reproduction

This app passes a normal cross-origin URL to `next/image` as `blurDataURL`. The original image intentionally returns 404 so the placeholder remains observable. `verify.mjs` serves a controlled red SVG without CORS headers, renders the page in pinned headless Chrome, and checks whether that red URL placeholder is actually painted.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported missing-placeholder symptom is present; exit code 1 means the URL placeholder rendered.

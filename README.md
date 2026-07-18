# Next.js issue 77513 reproduction

This minimal Pages Router app keeps the reporter's CSS-in-JS extraction pattern: `next dev --turbo` renders Ant Design through an `@ant-design/cssinjs` cache, and `_document` writes the extracted CSS relative to the compiled helper's `__dirname`.

Run `npm install` and `node verify.mjs`. The verifier succeeds only when the rendered CSS link is broken while Turbopack wrote non-empty extracted CSS under its internal chunk tree instead of `.next/static/css`.

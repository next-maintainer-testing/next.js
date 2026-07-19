# Next.js issue 77215 reproduction

This minimal App Router app renders a client parent around a `next/dynamic` child. The verification starts `next dev` and uses headless Chromium to compare the browser render count with a direct-import baseline. It exits 0 only when the dynamic child causes the reported extra parent render.

Run `npm install` and `node verify.mjs`.

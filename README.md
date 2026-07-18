# Reproduction for vercel/next.js #79141

This minimal App Router project places `page.js` under `app/@grida/pixel-grid`.
Next.js treats `@grida` as a parallel-route slot: `/pixel-grid` renders the marker,
while the requested literal route `/@grida/pixel-grid` responds with 404.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported symptom is present.

# Next.js issue 73746 reproduction

This minimal App Router project uses `output: 'export'`, a dynamic route with
`dynamicParams = true`, and one generated parameter (`id: '1'`). The verifier
starts `next dev` and requests the ungenerated route `/assessment/results/6`.
It reports the issue when Next.js rejects that request as missing from
`generateStaticParams()` instead of rendering `Assessment result 6`.

Run `npm install` and then `node verify.mjs`.

# Next.js issue 66942 reproduction

`node verify.mjs` runs npm's dependency resolver against the minimal dependency set copied from the dashboard starter template at `vercel/next-learn@58f9a68c6a2a0050976e52969b0dcf427281610a`. Exit code 0 means the reported `ERESOLVE unable to resolve dependency tree` / `undefined@undefined` installation failure occurred.

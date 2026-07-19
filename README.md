# Next.js issue 54972 reproduction

The reporter repeatedly documented the relevant file as `app/api/draft/rout.ts`. This minimal JavaScript equivalent preserves that spelling as `app/api/draft/rout.js`, alongside the reported catch-all page and `generateStaticParams` setup.

The verifier requests `/api/draft` and reports the symptom when the catch-all page handles it instead of a static route at that path.

Run `npm install` and `node verify.mjs`.

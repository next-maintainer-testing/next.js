# Next.js issue 73600 reproduction

This minimal App Router project starts Next.js 15.0.3 with Turbopack and checks the generated icon metadata for an SVG whose intrinsic viewBox is 123 by 123. The reported symptom is present when the rendered icon link uses `sizes="123x123"` instead of `sizes="any"`.

Run `npm install`, then `node verify.mjs`.

# Next.js issue 62849 reproduction

This app statically generates only `/foo`. Its `[slug]` page exports `dynamic = 'force-static'`, which the reported documentation says should make `dynamicParams` default to `false`. The verifier builds and starts the production app, then reports the bug as present when the ungenerated `/bar` route returns the rendered page instead of 404.

Run `npm install && node verify.mjs`. Exit code 0 means the reported symptom is present; 1 means it is absent.

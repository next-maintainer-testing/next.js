# Next.js issue 58269 reproduction

This app conditionally renders one of two client components from a Server Component. The verifier requests only the Moment component, then checks whether the downloaded route scripts also contain the unrendered jQuery component.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported bundling symptom is present; exit 1 means absent.

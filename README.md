# Next.js issue 82170 reproduction

This minimal Pages Router app uses the reported browserslist and a global `ul { padding-inline-start: 20px; }` rule. The verifier starts Turbopack development mode and checks the emitted CSS for the reported higher-specificity `ul:not(...)` selector.

Run `npm install` and then `node verify.mjs`. Exit code 0 means the symptom is present; 1 means it is absent.

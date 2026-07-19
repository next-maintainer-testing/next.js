# Next.js issue 75180 reproduction

This minimal app reproduces unused message JSON being included in the middleware bundle. Run `npm install` and `node verify.mjs`; exit code 0 means the reported symptom is present, while exit code 1 means it is absent.

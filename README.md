# Next.js issue 53558 reproduction

This minimal App Router project checks the debugger-visible source-map metadata in the two compiled React Refresh modules named in the report. The verifier starts Node's inspector, observes both modules being parsed with `.js.map` URLs, and reports the bug only when resolving those debugger-advertised maps produces `ENOENT` for both files.

Run `npm install`, then `node verify.mjs`. Exit 0 means the reported missing-source-map symptom is present; exit 1 means it is absent.

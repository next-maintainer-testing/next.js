# Next.js issue #83925 reproduction

This standalone app reproduces the reported SWC minifier failure. On affected versions, `next build` fails while prerendering `/` with `ReferenceError: range is not defined`; a fixed version builds successfully.

Run `npm install` and then `node verify.mjs`. Exit code 0 means the reported symptom is present, 1 means it is absent, and any other exit code means the check failed.

# Next.js issue 60754 reproduction

This app measures cached `next build` time with output file tracing disabled and enabled against a generated 20,000-file dynamic filesystem fixture. The verifier reports the runtime slowdown, trace artifacts, and whether `outputFileTracing: false` is ignored.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported tracing-performance symptom is present, exit 1 means absent, and any other exit code means the check failed.

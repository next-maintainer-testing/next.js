# Next.js issue 32645 reproduction

This minimal Pages Router app places a normal CSS rule before a Google Fonts `@import`, matching the issue report. The verifier builds the app and inspects the emitted stylesheet. It reports the symptom when the emitted CSS keeps the remote `@import` after an ordinary rule in the same stylesheet, where browsers ignore it instead of receiving the import separately.

Run `node verify.mjs`. Exit code 0 means the reported symptom is present, 1 means it is absent, and any other code means verification failed.

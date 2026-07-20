# Issue 72935 reproduction

This app delays `generateMetadata` for 2.5 seconds while page content takes 5 seconds. Run `node verify.mjs`; exit 0 means the Suspense fallback was blocked until metadata finished, and exit 1 means it streamed before the metadata delay.

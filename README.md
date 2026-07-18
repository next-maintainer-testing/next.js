# Next.js issue 78457 reproduction

This app throws an object with a getter-only `message` property while loading `instrumentation.ts`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means Next.js replaced the original instrumentation failure with the getter-assignment `TypeError`; exit code 1 means the original marker was preserved.

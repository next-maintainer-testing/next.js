# Issue 56780 reproduction

This invokes the `create-next-app` release matching the installed Next.js version with the custom alias `@/app/*`. It then compiles an import of `@/app/probe` where `app/probe.ts` exists. The reported symptom is present when TypeScript emits TS2307 because the generated alias does not resolve that file.

Run with `node verify.mjs`. Exit 0 means the reported compiler error is present, exit 1 means the alias resolves, and any other exit code means the check failed.

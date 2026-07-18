# Issue 57652 reproduction

This minimal TypeScript check reproduces the issue's `startTransition(() => asyncServerFunction())` diagnostic. Because the report did not include package versions, it pins Next.js 14.0.0 (the stable release current when the issue was filed), React 18.2.0, and the then-current `@types/react` 18.2.33.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported type error is present; exit 1 means it is absent.

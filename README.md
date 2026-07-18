# Next.js issue 59160 reproduction

This minimal TypeScript check captures the code shown in the issue: passing the string literal `"push"` as `redirect`'s second argument is rejected, while importing and passing `RedirectType.push` compiles. The issue did not provide a repository or package versions, so the reproduction uses Next.js 14.0.3 (the stable release current when the issue was filed on December 1, 2023) with React 18.2.0.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported type error is present, exit 1 means it is absent, and exit 2 means verification failed.

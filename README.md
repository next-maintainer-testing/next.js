# Next.js issue 61737 reproduction

This minimal type-level probe checks the reported App Router API behavior: `useRouter().push()` returns `void`, so callers cannot await navigation completion as they could with the Pages Router API.

The issue did not provide a repository or package version. Next.js 14.1.0 (the stable release current when the issue was filed) and React 18.2.0 are used as the historical baseline. Run `npm install` and `node verify.mjs`; exit 0 means the reported behavior is present.

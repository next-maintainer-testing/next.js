# Next.js issue 53940 reproduction

This minimal App Router project exports both a default page component and a named `utilHelper` function from `app/page.tsx`. Run `node verify.mjs`; exit 0 means `next build` rejected the named export with the reported diagnostic, while exit 1 means the build accepted it.

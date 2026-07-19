# Next.js issue 47097 reproduction

This minimal route returns an `@vercel/og` `ImageResponse` containing a valid HTML `<img>`. The verifier runs Next.js's ESLint configuration and reports whether `@next/next/no-img-element` incorrectly warns in this image-generation context.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported warning is present; exit 1 means it is absent.

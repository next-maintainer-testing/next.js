# Next.js issue 76515 reproduction

This minimal Pages Router app declares `pb-embeddable-form` in the global `JSX.IntrinsicElements` namespace exactly as reported, then uses the custom element in a page.

Run `node verify.mjs`. Exit code 0 means `next build` emitted the reported `JSX.IntrinsicElements` diagnostic; exit code 1 means the build accepted the element.

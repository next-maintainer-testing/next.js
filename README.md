# Next.js issue 82934 reproduction

This minimal App Router project directly loads `/signin`, then calls `router.push("/signin")` from that same page. The reproduction check reports the issue when the `(.)signin` intercepting route unexpectedly renders in the `@authModal` slot.

Run `npm install`, then `node verify.mjs`.

# Next.js issue 66876 reproduction

This app enables typed routes and rewrites `/@:username` to `/user/:username`. The verifier starts `next dev` and checks the generated `.next/types/link.d.ts`: the bug is present when the dynamic rewrite is emitted as the literal route `` `/@[username]` `` rather than an interpolated `SafeSlug` route.

Run `npm install` and then `node verify.mjs`.

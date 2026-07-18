# Next.js issue 78985 reproduction

This minimal App Router project reproduces a development-mode race: after client navigation to `/page2`, its effect calls `router.push('?asdf')` and then invokes a Server Action in `setTimeout(..., 0)`. `verify.mjs` observes whether that action Promise remains pending.

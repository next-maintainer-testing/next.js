# Next.js issue 86877 reproduction

This minimal app enables typed routes and configures redirect source `/c:id`. Run `node verify.mjs`; exit code 0 means `next typegen` reproduced the bug by emitting `/c[id]` as a static route with no `id` parameter, while exit code 1 means the bug is absent.

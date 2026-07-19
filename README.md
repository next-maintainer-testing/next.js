# Next.js issue 77611 reproduction

This app builds a standalone server while `CIRCLE_NODE_TOTAL=2`, then runs that server with `CIRCLE_NODE_TOTAL=9`. The verification requests a runtime route and checks whether the standalone server still exposes the build-time CPU value (`1`) instead of the runtime value (`8`).

Run with `node verify.mjs` after installing dependencies.

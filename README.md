# Next.js issue 64961 reproduction

This minimal app uses `output: "export"`. The verifier builds it, confirms the exported CSS works over HTTP, then opens `out/index.html` directly as a `file:` URL and checks the rendered card's computed style. Exit 0 means the direct-open page lost its exported styling.

Run `npm install`, then `node verify.mjs`.

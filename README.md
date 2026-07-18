# Next.js issue #78548 reproduction

This minimal App Router API route parses the same `1.repro` Markdown input used by the linked upstream Turbopack report with `markdown-it@14.1.0`. `node verify.mjs` exits 0 only when the route throws the reported `ReferenceError: isSpace is not defined`, and exits 1 when parsing succeeds.

# Next.js issue 58494 reproduction

Running `node verify.mjs` builds a route containing an accidentally recursive client component. The check reports the issue only when prerendering fails with `RangeError: Maximum call stack size exceeded` rather than a recursion-specific diagnostic.

# Next.js issue 79424 debugger reproduction

This minimal app attaches to the Node inspector used by `next dev --turbopack`, maps the page through its emitted source map, and sets a server-side breakpoint on the page's `console.log`. It observes one normal refresh, changes the log text as described by the reporter, and observes the refresh after recompilation.

The verifier exits 0 when the breakpoint is unbound, missed, or pauses more than once after the edit (the reported erratic continue behavior); it exits 1 only when the breakpoint pauses exactly once before and after the edit. Other exit codes are check failures.

Run `npm install`, then `node verify.mjs`.

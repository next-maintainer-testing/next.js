# Next.js issue 55168 reproduction

This reconstructs the reporter's App Router development-mode layout: the layout sequentially awaits the same uncached `GET` twice. `verify.mjs` owns a delayed local upstream counter, loads the page once after startup and then reloads it, and reports the bug only when the initial render is memoized but the reload sends duplicate upstream requests during one render pass.

Run with `node verify.mjs`. Exit 0 means the reported symptom is present, exit 1 means it is absent, and other exit codes mean the check failed.

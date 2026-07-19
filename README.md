# Next.js issue 74498 reproduction

This app demonstrates the behavior underlying the documentation report: a `use cache` function can inspect a non-serializable class instance defined at module scope. `node verify.mjs` starts Next.js and exits 0 only when the rendered response contains the value returned by that instance's method.

The issue did not include a package manifest. The reproduction pins `15.1.1-canary.24`, the newest `use cache`-capable canary published before the issue was filed on January 3, 2025.

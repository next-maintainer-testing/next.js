# Next.js issue 76710 reproduction

Run `npm install`, then `npm run dev`, and visit a missing route such as `/oops`.
On Next.js 15.2.0, the built-in 404 markup injects a `<style>` that targets `body`, overriding the custom layout's red-on-blue body styling and margin.

`node verify.mjs` checks the actual development-server 404 response. Exit code 0 means the body-targeting error style was injected (bug present); exit code 1 means it was not.

# Next.js issue 74961 reproduction

This minimal App Router page defines an inline server action that closes over `id` from the render scope and also defines a callback inside the action. Submitting the form should log the captured value, but the reported Next.js release loses the closure binding and throws `ReferenceError: id is not defined` on the server.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported runtime error occurred; exit code 1 means the action successfully logged the captured value.

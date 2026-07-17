# Next.js issue 56699 reproduction

This App Router page streams a shell while a server component is suspended. The verifier requests the page, closes the client socket after the streamed response begins, and checks whether the development server logs `The render was aborted by the server without a reason.`

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported message occurred; exit code 1 means it did not; any other code means the check failed.

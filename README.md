# Next.js issue 54015 reproduction

This app reproduces a server-action `redirect('/projects/1')` failing to close a conditionally rendered `@create` parallel-route modal opened at `/projects/1/create`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the modal remained open (bug present), 1 means it closed, and any other code means the check failed.

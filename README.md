# Next.js issue 84385 reproduction

This minimal App Router project imports a nonexistent local module under Turbopack. The verification script loads the development error overlay and checks whether activating its source location sends the launch-editor request that should open `app/page.js`.

Run `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means the overlay source location launches the editor request.

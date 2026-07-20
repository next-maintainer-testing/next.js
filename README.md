# Next.js issue 71810 reproduction

This minimal app preserves the reporter's `app/icon.svg`. The verification command runs `next build` and reports the bug only when Next.js rejects that icon as an invalid image file.

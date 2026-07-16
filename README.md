# Next.js issue 49427 reproduction

This minimal App Router app reproduces scroll position being preserved when navigating between values of one dynamic segment whose first element is a sticky header.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom occurred, 1 means scroll reset correctly, and any other code means verification failed.

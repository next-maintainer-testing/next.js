# Next.js issue 82254 reproduction

A Pages Router page renders a plain, non-lazy `<img>`. The verification script starts `next dev`, fetches the server-rendered page, and reports the bug only when React's image preload link appears inside `<body>` rather than `<head>`.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported symptom is present; 1 means it is absent; 2 means verification failed.

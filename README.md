# Issue 77556 reproduction

This minimal app reproduces the reporter's forwarded Server Action request. The check sends `Origin: http://localhost:3333`, `X-Forwarded-Host: localhost`, and `X-Forwarded-Port: 3333`, then observes whether the increment action is rejected.

Run `npm install` and `node verify.mjs`. Exit 0 means the reported rejection occurred; exit 1 means the action returned 1.

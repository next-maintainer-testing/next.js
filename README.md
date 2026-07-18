# Issue 75192 reproduction

A Server Component renders members of an object exported by a Client Component module. The reported behavior is an HTTP 500 with an invalid element-type error instead of rendering both members.

Run `npm install` and `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.

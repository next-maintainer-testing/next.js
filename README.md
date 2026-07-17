# Next.js issue 82574 reproduction

This minimal Pages Router app calls `useRouter`. The verifier runs `next build` with `NODE_ENV=development` and reports the issue only when the build fails with `NextRouter was not mounted`.

Run:

```sh
npm install
node verify.mjs
```

Exit code 0 means the reported symptom is present; exit code 1 means it is absent.

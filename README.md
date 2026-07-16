# Reproduction for vercel/next.js #85865

This minimal Pages Router app contains `/api/projects/[id]` and a nested route rooted at `/api/projects/[projectId]`. Running the verifier starts `next dev` and directly checks for the reported conflicting dynamic-slug startup/runtime error.

```sh
npm install
node verify.mjs
```

Exit code 0 means the reported symptom occurred; 1 means it was absent; any other exit code means the check itself failed.

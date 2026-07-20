# Next.js forms `useActionState` reproduction

Minimal reproduction for vercel/next.js issue #66398. It uses the reported Next.js 14.2.3 and React 18.2.0 versions while importing `useActionState`, as the forms example did. Run `node verify.mjs`; exit 0 means the reported incompatibility occurred, exit 1 means it did not, and any other exit code means the check failed.

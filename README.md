# create-next-app `.github` conflict reproduction

This reproduces issue vercel/next.js#79550. Run `npm install` and `node verify.mjs`; exit 0 means create-next-app rejected the directory solely because `.github` was already present, while exit 1 means it accepted the directory.

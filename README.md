# Next.js issue 54550 reproduction

This app imports `./Form.jsx` from `app/page.tsx` while the source file is `app/Form.tsx`. Run `node verify.mjs`: exit 0 means the reported module-resolution failure occurred, exit 1 means the alias resolved, and any other exit means the check failed.

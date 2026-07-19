# Next.js issue 74793 reproduction

This minimal App Router project passes the same object to a client component and a nested server component. In development, the inner client component reports the runtime `$$typeof` of its plain `<button>` child. Run `npm install` and `node verify.mjs`; exit 0 means the reported `Symbol(react.lazy)` symptom is present.

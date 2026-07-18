# Next.js issue 45979 reproduction

A generated App Router route (`/[slug]`) exports `generateStaticParams`, while its root layout reads `cookies()` from `next/headers`.

Run `node verify.mjs`. Exit code 0 means the reported runtime 500 occurred, 1 means the route loaded successfully, and any other code means verification failed.

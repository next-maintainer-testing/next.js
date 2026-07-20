# Next.js issue 55331 reproduction

This minimal App Router project combines a `[lang]` route using `generateStaticParams` with the legacy `i18n` configuration. On the reported Next.js version, `next build` fails with an export-path mismatch for `/en` and `/es`.

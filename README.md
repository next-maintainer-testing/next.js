# Next.js issue 59136 reproduction

This minimal App Router project uses `output: 'export'` and `app/sitemap.js`. The verifier starts the development server and requests `/sitemap.xml`; exit code 0 means the reported `generateStaticParams()` error occurred, while exit code 1 means valid sitemap XML was returned.

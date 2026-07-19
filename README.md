# Next.js issue 52711 reproduction

This app runs the reporter's `next-mdx-remote` and `rehype-pretty-code` pipeline in a dynamic App Router route. The verifier builds Next.js standalone output, starts only that traced server bundle, requests `/api/render`, and detects the reported missing `shiki/themes/one-dark-pro.json` runtime error.

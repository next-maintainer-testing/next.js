# Next.js issue 63968 reproduction

This repository runs two App Router applications. App1 rewrites `/app2` to App2, which is configured with `basePath: '/app2'`. The verifier opens App1 in headless Chrome, clicks its `next/link`, and compares the rendered heading with a direct request to the rewritten URL.

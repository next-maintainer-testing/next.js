# Next.js issue 81290 reproduction

A force-static dynamic route calls `notFound()` for `/en/404`. The verifier builds the app, requests that route from `next start`, and reports the bug only when the 404 response is publicly cached with a positive `s-maxage` instead of carrying private/no-store protections.

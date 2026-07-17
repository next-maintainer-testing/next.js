# Next.js issue 73028 reproduction

This minimal app has a root optional catch-all route. The verifier starts `next dev` and requests a nonexistent `/_next/static/chunks/*.js` asset. The bug is present when that internal asset path is intercepted and rendered by the catch-all page with an HTML 200 response instead of bypassing the application route.

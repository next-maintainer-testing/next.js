# Next.js issue 50320 reproduction

This minimal Pages Router app combines an empty root middleware with `compress: false`. The verifier starts the development server and checks whether the root page's successful HTTP response is empty instead of containing its visible marker.

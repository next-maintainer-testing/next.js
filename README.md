# Next.js issue 74026 reproduction

This minimal app submits a Server Action that calls `redirect('/destination')`. The verification script inspects the actual Server Action HTTP response and reports the issue only when a 303 response carries `x-action-redirect` without a standard `location` header.

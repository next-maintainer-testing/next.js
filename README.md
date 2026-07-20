# Next.js issue 59854 reproduction

This minimal custom-server app disables file-system public routes and explicitly renders `/a` with `app.render`. The verifier reports the bug when the request reaches a healthy custom server but returns Next.js's 404 instead of the `ROUTE_A_CONTENT` page.

# Next.js workflow function-name reproduction

This minimal app imports a workflow function from a local package into an API route. The verifier builds and starts Next.js, requests the route, and reports the bug when the production bundle changes the function's runtime `name` from `temporalWorkflow`.

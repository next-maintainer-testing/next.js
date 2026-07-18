# Next.js issue 54256 reproduction

This App Router page renders a client component that calls `useSearchParams` inside a Suspense boundary. The verifier builds and starts the production app, requests `/?value=from-query`, and checks whether the client component's visible paragraph was included in the server HTML. Exit code 0 means the reported missing-server-render symptom is present; exit code 1 means it is absent.

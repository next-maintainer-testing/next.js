# Next.js issue 61195 reproduction

This minimal app uses `output: 'export'` and a route handler that reads `request.url`. Run `node verify.mjs`; exit 0 means the static export build failed with the reported dynamic-rendering error, while exit 1 means that symptom was absent.

# Next.js issue 84342 reproduction

This minimal app uses `output: 'standalone'`. The verification script installs dependencies with pnpm's virtual store outside `node_modules`, builds with webpack, and reports the issue only when the generated standalone `node_modules` contains dangling symbolic links.

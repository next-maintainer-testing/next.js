# Next.js issue 58459 reproduction

This minimal App Router project reproduces the issue's module-scope `ENOENT` failure. Run `npm install`, start `npm run dev`, and request `/api/hello`. The reported bug returns the Next.js 404 page instead of surfacing the module error.

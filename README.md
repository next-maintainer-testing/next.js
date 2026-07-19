# Next.js issue 66418 reproduction

The root layout calls a server-side `fakeRequest` helper while rendering a parallel `@authModal` slot that contains an intercepted route. `verify.mjs` starts the app in development mode, makes one document request, and counts runtime invocations of that request helper. Exit 0 means the helper ran more than once for the single render request; exit 1 means it ran once.

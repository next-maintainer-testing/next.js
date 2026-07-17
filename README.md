# Issue 45204 reproduction

This minimal Pages Router app mirrors the reporter's StackBlitz: several SSR pages import one backend module whose ID is generated at module evaluation time. `node verify.mjs` starts the development server and requests newly compiled routes. It exits 0 when those routes observe different IDs, proving that the unchanged backend module was evaluated more than once in one dev-server process.

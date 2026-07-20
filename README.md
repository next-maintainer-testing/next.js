# Next.js issue #64128 reproduction

This custom Next.js development server attaches a `ws` `WebSocketServer` with
`{ server, path: '/graphql' }` to the same HTTP server used by Next.js. The
verification script requests the page and then directly checks whether the
webpack HMR WebSocket can connect.

Run with `npm install`, then `node verify.mjs`. Exit code 0 means the reported
HMR WebSocket failure was observed; exit code 1 means the HMR socket opened.

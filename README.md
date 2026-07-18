# Next.js issue 50461 reproduction

This minimal app uses the reporter's Express custom-server pattern and checks whether `/_next/webpack-hmr` remains pending instead of completing a WebSocket upgrade.

Run `npm install` and then `node verify.mjs`. Exit 0 means the reported pending HMR handshake was observed; exit 1 means a 101 WebSocket response was received.

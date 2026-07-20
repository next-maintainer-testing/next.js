# Next.js issue 22069 reproduction

This production custom-server app renders one blocking-ISR catch-all route under a host-derived internal pathname. `node verify.mjs` requests the same public path with two Host headers and checks whether Next.js writes each generated page under its host-specific internal route rather than a shared public-path cache entry.

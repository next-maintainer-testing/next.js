# Next.js issue 63201 reproduction

This static App Router application imports several global and module CSS files. `node verify.mjs` performs repeated clean production builds and compares every emitted app chunk filename and SHA-256 digest. Exit 0 means identical source emitted different chunks; exit 1 means all compared builds were identical.

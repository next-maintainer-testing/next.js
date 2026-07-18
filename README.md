# next/font local `.woff` preload reproduction

This minimal Pages Router app configures one local font with `.woff2` and `.woff` sources. Run `node verify.mjs`; exit 0 means the rendered page contains a font preload for the `.woff` source, reproducing vercel/next.js#51356.

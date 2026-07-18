# Next.js issue 80208 reproduction

This minimal App Router project imports a minified global CSS file whose trailing `sourceMappingURL` names a map that is intentionally absent. The verifier starts `next dev`, loads the page and emitted stylesheet, then requests the referenced map exactly as a browser would. Exit 0 means that emitted CSS retains the reference and the map request returns 404.

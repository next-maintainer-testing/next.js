# Next.js issue 54437 reproduction

This minimal App Router page supplies an `httpEquiv.refresh` value through the Metadata API. The verifier requests the rendered page and reports the issue when the response contains the page marker but omits the corresponding `<meta http-equiv="refresh">` element.

Run with `npm install && node verify.mjs`.

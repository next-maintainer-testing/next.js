# Next.js issue 82177 reproduction

This minimal app statically exports an App Router `opengraph-image` generated with `ImageResponse`. The verifier builds the export and reports the bug only when the emitted PNG is extensionless, which causes static hosts such as GitHub Pages to serve an unsuitable MIME type.

# Next.js issue 59648 reproduction

This minimal App Router route imports `@napi-rs/image` and invokes its native addon while processing an uploaded PNG. Run `npm install`, `npm run dev`, then POST an image to `/image`.

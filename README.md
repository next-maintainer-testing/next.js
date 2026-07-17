# Next.js issue 85208 reproduction

The app enables `images.unoptimized` globally but passes `unoptimized={false}` to one `next/image`. `node verify.mjs` starts `next dev` and inspects the rendered image URL: exit 0 means the raw URL (the reported bug), while exit 1 means the optimizer URL is used.

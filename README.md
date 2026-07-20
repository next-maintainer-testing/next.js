# Next.js issue 72920 reproduction

This minimal App Router project uses `generateStaticParams` with `dynamicParams = false` to statically generate `/item/3`. Its API route calls `revalidatePath('/item/3')`; the verifier confirms that the page initially returns 200 and detects the reported bug only if it returns 404 after revalidation.

Run `npm install`, then `node verify.mjs`.

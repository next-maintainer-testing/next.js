# next/cache duplicate completion reproduction

This minimal Next.js app reproduces issue #77823. After `next build` generates `.next/types/cache-life.d.ts`, the TypeScript language service returns `revalidatePath` and `revalidateTag` twice as auto-import completions from `next/cache`. Run `node verify.mjs`; exit 0 means the duplicate-completion symptom is present and exit 1 means it is absent.

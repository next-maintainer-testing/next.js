# Issue 74487 reproduction

This minimal App Router MDX page maps `h1` to a component with Tailwind's `text-red-500` class in the required root `mdx-components.tsx`. The standard Tailwind content globs omit that root file, so the rendered heading has the class but the generated stylesheet has no matching utility rule.

Run `node verify.mjs`. Exit code 0 means the reported missing-style symptom is present; exit code 1 means the utility rule is present; any other code means verification failed.

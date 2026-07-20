# Next.js nested loading boundary reproduction

This minimal App Router project reproduces vercel/next.js#73325. From `/`, click **Open art page**. While the delayed nested page loads, the nested `Loading art page...` boundary is expected; the reported bug renders the parent `Loading artist page...` boundary instead.

Run `npm install`, then `node verify.mjs`. Exit code 0 means the reported wrong parent loading UI appeared, 1 means it did not, and any other exit code means the check failed.

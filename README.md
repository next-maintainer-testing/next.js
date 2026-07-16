# Next.js issue 70148 reproduction

This minimal App Router application models the reported navigation: open a deep documentation section, follow two links, then use browser Back. The intermediate page has delayed content, reflecting the loading/skeleton cases reported in the issue discussion. The verification waits for content to settle and checks whether Back restores the previous scroll position.

Run `node verify.mjs`. Exit code 0 means the scroll-restoration symptom is present; exit code 1 means restoration works.

# Issue 73902 reproduction

A minimal App Router page combining the `use cache` directive with incremental PPR. Run `node verify.mjs`; exit 0 means the reported build diagnostic occurred, while exit 1 means it was absent.

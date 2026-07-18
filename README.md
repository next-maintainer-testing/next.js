# Next.js issue 56432 reproduction

This minimal App Router page exports the Edge runtime and renders a Client Component that calls `useRouter`. The reported regression was Windows-specific: old releases built a mixed-separator Edge alias, while the fix constructs that alias with `path.join`. The preload/config pair simulates the resulting Windows alias miss when run on a non-Windows verifier, without keying on a package version.

Run `node verify.mjs`; exit 0 means the actual page render emitted the reported `invariant expected app router to be mounted` error or an `<html id="__next_error__">` error document. Exit 1 means the rendered page did not exhibit the symptom.

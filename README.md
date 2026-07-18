# Next.js issue 75709 reproduction

This app renders whether the App Router authentication documentation associated with the installed exact Next.js release tag contains the reported stale `useFormState` reference. Because the documentation-only report did not name a package version, the baseline is reconstructed as `15.0.4`, the last affected stable release before the documentation changed to `useActionState`.

Run `npm install`, then `node verify.mjs`. Exit 0 means the rendered check found `useFormState`; exit 1 means it did not; any other exit code means the check failed.

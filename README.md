# Next.js issue 68177 reproduction

This app lists a dependency in `transpilePackages` and imports it from an App Router page. The fixture preserves the exact package path shape produced when pnpm installs a Git dependency; it is committed so verification does not depend on Git credentials or package-manager layout. On affected Next.js releases, requesting `/` during `next dev` produces `ERR_INVALID_ARG_VALUE` because the generated vendor chunk path contains a null byte.

Run `pnpm install` and then `node verify.mjs`. Exit code 0 means the reported symptom was observed; exit code 1 means the page compiled successfully.

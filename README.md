# Next.js CI build-cache warning reproduction

This minimal App Router app models the issue's effective AWS CodeBuild state: the buildspec names `.next/cache/**/*`, but no cache files are restored because project-level caching is disabled. The check starts a clean CI build and detects the reported `No build cache found` warning. Exit code 0 means the warning is present; exit code 1 means it is absent; any other code means the check failed.

The reporter later confirmed that enabling the CodeBuild project cache resolves the setup problem, so the warning reproduced here is expected Next.js behavior rather than evidence that App Router caching is broken.

Issue #63711 did not provide a repository or a Next.js version. The package uses 14.1.4 because it was the latest stable Next.js release published before the issue was opened on March 26, 2024. This is a contemporaneous baseline, not a reporter-declared version.

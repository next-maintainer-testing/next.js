# Next.js issue 91396 memory reproduction

This minimal App Router project uses the versions and `output: 'standalone'` configuration from the report. The verifier starts Turbopack development mode, warms twelve page URLs, sends repeated page and API requests, and measures total RSS for the complete dev-server process tree.

The report says 1–2 GiB is expected and approximately 7 GiB is the bug. The reported high-memory symptom is therefore considered present when process-tree RSS reaches 2 GiB. Exit code 0 means the symptom occurred, 1 means it did not, and any other code means the check failed.

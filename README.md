# Issue 82729 reproduction

This minimal App Router project checks the reported development-only symptom with a real headless Chromium browser. The verifier performs several source edits, waits for each Fast Refresh update, and counts browser `GET /favicon.ico` requests during the following four seconds. It exits 0 when any single refresh causes at least two requests, 1 when every refresh causes at most one, and 2 if the check itself fails.

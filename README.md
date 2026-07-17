# Next.js issue 83771 reproduction

This app has both a static `/archive` page and a dynamic intercepted route in the `@modal` slot. The verifier opens `/` and clicks the `/archive` link. It reports the bug only if that soft navigation renders the dynamic interception page instead of the static Archive page.

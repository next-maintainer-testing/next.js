# Next.js issue 55763 reproduction

This minimal Pages Router app imports `theme.css` into the global stylesheet with `@import './theme.css' layer(theme)`. The verifier builds and serves the app, opens it in Chromium, and checks the target element's computed color. Exit 0 means the imported declaration was not applied (the reported symptom); exit 1 means it was applied.

# Issue 58687 reproduction

This standalone App Router application models the reporter's dynamic large page: 19 sections and 475 MUI article cards are rendered on every request. `node verify.mjs` builds the production app and measures three rounds of ten simultaneous SSR requests.

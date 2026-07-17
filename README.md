# Issue 82412 reproduction

This minimal App Router app models the report's client-fetched search page and linked detail page. The search route also models a slow dynamic page response, and the detail route refreshes the Router Cache before Back navigation. `verify.mjs` directly measures whether the URL changes to `/` while detail-page content remains visible for at least one second.

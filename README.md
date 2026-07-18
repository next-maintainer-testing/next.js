# Next.js issue 56344 reproduction

This minimal App Router project has distinct parent and nested dynamic-route loading UIs. The dynamic page pauses briefly so the loading UI emitted while opening `/blog/singleton` can be observed deterministically.

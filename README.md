# Next.js issue 88544 reproduction

This minimal App Router project imports a Sass variable through the documented CSS Modules `:export` syntax. `verify.mjs` starts the default `next dev` Turbopack server and checks whether the rendered server output contains the exported `#64ff00` value. Exit 0 means Turbopack omitted the value (the reported symptom), exit 1 means the value was exported, and any other exit code means the check itself failed.

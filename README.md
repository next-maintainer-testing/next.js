# Next.js issue 53807 reproduction

This Pages Router app enables Babel with `compact: true` and imports a generated JavaScript module larger than 500 KB. Run `node verify.mjs`; exit 0 means Babel still prints its deoptimised-styling warning despite the compact option, while exit 1 means the warning is absent.

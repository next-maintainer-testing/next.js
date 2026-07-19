# Next.js issue 76269 reproduction

This minimal app imports a stylesheet containing the escaped-space attribute selector `[data-attr=\\ ]`. Run `node verify.mjs`: exit code 0 means the reported build crash occurred, while exit code 1 means the build passed.

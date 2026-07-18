# Next.js issue 63041 reproduction

This app calls `next/font/google` with no-substitution template literals. Run `node verify.mjs`: exit 0 means Next.js rejected those static strings with the reported font-loader error, while exit 1 means the build accepted them.

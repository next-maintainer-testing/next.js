# Next.js issue 78137 reproduction

This standalone-output app renders an image whose URL contains non-Latin characters. Run `node verify.mjs`; exit 0 means the reported ByteString server error was observed, while exit 1 means it was absent.

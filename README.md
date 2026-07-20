# Next.js issue 58754 reproduction

A client class error boundary wraps a Server Component that throws during rendering. Run `node verify.mjs`: exit 0 means the reported symptom is present (the custom boundary fallback is not rendered and the server throw escapes); exit 1 means the fallback handled the throw.

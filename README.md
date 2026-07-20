# Next.js issue 72598 reproduction

This minimal App Router project reproduces the reported failure when a form whose action comes from `useActionState` calls the native `form.submit()` method from `onSubmit` while another form component is conditionally rendered.

Run `node verify.mjs`. Exit code 0 means the runtime symptom is present, 1 means it is absent, and any other exit code means verification failed.

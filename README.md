# next/image onError rerender reproduction

This minimal runtime harness renders `next/image` in a DOM, rerenders it with an inline `onError` callback, and observes whether the image element's `src` property is needlessly assigned to itself. It compares that behavior with an otherwise identical image without `onError`.

Run `npm install` and then `node verify.mjs`. Exit code 0 means the reported symptom is present; exit code 1 means it is absent.

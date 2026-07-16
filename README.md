# Next.js issue 68384 reproduction

`MiddlewareConfig` should describe the documented `export const config` shape. The sample matcher uses the documented `source` field. Run `npm install` and `node verify.mjs`; exit 0 means the reported type error is present, while exit 1 means it is absent.

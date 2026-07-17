globalThis.__polyfillStarted = true

await new Promise((resolve) => setTimeout(resolve, 3000))

Intl.Locale = class LocalePolyfill {
  constructor(tag) {
    this.baseName = String(tag)
  }

  toString() {
    return this.baseName
  }
}
globalThis.__polyfillDone = true

export {}

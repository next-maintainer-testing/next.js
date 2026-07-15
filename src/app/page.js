'use client'

import wasmUrl from './empty.wasm'

export default function Page() {
  return <main data-wasm-url={wasmUrl}>WASM URL: {wasmUrl}</main>
}
